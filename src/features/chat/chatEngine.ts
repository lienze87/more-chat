import {Platform} from 'react-native';
import {createId} from '../../domain/chat/ids';
import {
  buildEnvInfo,
  buildLatestReminder,
  type RuntimePlatform,
} from '../../domain/chat/userMetadata';
import {createAssistantMessage} from './streamReducer';
import type {ChatMessage, Conversation} from '../../domain/chat/types';
import {
  buildChatRequest,
  isFirstTurnOf,
} from '../../adapters/api/requestBuilder';
import {streamChatCompletion} from '../../adapters/api/chatClient';
import {MissingApiKeyError} from '../../adapters/api/errors';
import {
  APP_VERSION,
  MAX_INPUT_LENGTH,
  NETWORK_TIMEOUT_MS,
} from '../../config/appConfig';
import {registerRunCanceller, useChatStore} from './chatStore';
import {useSettingsStore} from '../settings/settingsStore';
import {createChatRunController} from './chatRun';

const chatRun = createChatRunController({
  stream: streamChatCompletion,
  getConversations: () => useChatStore.getState().conversations,
  setStreaming: streaming => useChatStore.getState().setStreaming(streaming),
  appendAssistantChunks: (conversationId, messageId, chunks) =>
    useChatStore
      .getState()
      .appendAssistantChunks(conversationId, messageId, chunks),
  updateAssistantMessage: (conversationId, messageId, updater) =>
    useChatStore
      .getState()
      .updateAssistantMessage(conversationId, messageId, updater),
  applyAutoTitle: (conversationId, title) =>
    useChatStore.getState().applyAutoTitle(conversationId, title),
  timer: {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
});

// 删除/清空会话时由 store 反向通知运行时，UI 不再需要手工调用 stopStreaming。
registerRunCanceller(conversationId =>
  chatRun.cancelConversation(conversationId),
);

function findConversation(conversationId: string): Conversation | undefined {
  return useChatStore
    .getState()
    .conversations.find(conversation => conversation.id === conversationId);
}

/** React Native 的平台标识映射为 env_info 使用的三种运行形态。 */
function currentPlatform(): RuntimePlatform {
  if (Platform.OS === 'web') {
    return 'web';
  }
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  return 'android';
}

/** 把设置里的工具开关翻译成 env_info 里的能力清单。 */
function describeCapabilities(settings: {
  webSearch: boolean;
  readUrl: boolean;
}): string[] {
  return [
    settings.webSearch ? '联网搜索' : null,
    settings.readUrl ? '阅读链接' : null,
  ].filter((item): item is string => item !== null);
}

async function runCompletion(params: {
  conversationId: string;
  assistantId: string;
  isFirstTurn: boolean;
}): Promise<void> {
  const {conversationId, assistantId, isFirstTurn} = params;
  const {settings, apiKey} = useSettingsStore.getState();
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return;
  }

  await chatRun.start({
    conversationId,
    assistantId,
    request: buildChatRequest({conversation, settings, isFirstTurn}),
    apiKey,
    baseUrl: settings.baseUrl,
    timeoutMs: NETWORK_TIMEOUT_MS,
  });
}

export async function sendMessage(
  conversationId: string,
  rawText: string,
): Promise<void> {
  if (chatRun.isRunning()) {
    return;
  }
  const text = rawText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!text) {
    return;
  }

  const {settings, apiKey} = useSettingsStore.getState();
  if (!apiKey.trim()) {
    throw new MissingApiKeyError();
  }
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return;
  }

  const now = Date.now();
  const platform = currentPlatform();
  const userMessage: ChatMessage = {
    id: createId('msg'),
    role: 'user',
    content: text,
    createdAt: now,
    status: 'complete',
    reminder: buildLatestReminder(new Date(now), {
      language: settings.language,
      location: settings.location,
      platform: platform === 'web' ? 'Web' : 'App',
    }),
    // 环境快照在发送时固化，回放历史时不会变成“当前”的能力。
    envInfo: buildEnvInfo({
      clientVersion: APP_VERSION,
      platform,
      capabilities: describeCapabilities(settings),
    }),
  };
  const assistant = createAssistantMessage(createId('msg'), now);
  const isFirstTurn = isFirstTurnOf(conversation);

  useChatStore.getState().startExchange(conversationId, userMessage, assistant);
  await runCompletion({
    conversationId,
    assistantId: assistant.id,
    isFirstTurn,
  });
}

/**
 * 从指定回复开始重写。
 *
 * 该回复及其之后的轮次都会被丢弃，这样「重新生成」中间某条回答时，后续
 * 内容不会悬空在原答案之上。
 */
export async function regenerateFrom(
  conversationId: string,
  messageId: string,
): Promise<void> {
  if (chatRun.isRunning()) {
    return;
  }
  const {apiKey} = useSettingsStore.getState();
  if (!apiKey.trim()) {
    throw new MissingApiKeyError();
  }
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return;
  }
  const index = conversation.messages.findIndex(
    message => message.id === messageId,
  );
  if (index < 0) {
    return;
  }
  // 没有可回放的用户消息时（例如首条就是助手消息）无法重写。
  const hasUserMessage = conversation.messages
    .slice(0, index)
    .some(message => message.role === 'user');
  if (!hasUserMessage) {
    return;
  }

  useChatStore.getState().truncateFrom(conversationId, messageId);
  const refreshed = findConversation(conversationId);
  if (!refreshed) {
    return;
  }
  const assistant = createAssistantMessage(createId('msg'));
  useChatStore.getState().addAssistantMessage(conversationId, assistant);
  await runCompletion({
    conversationId,
    assistantId: assistant.id,
    isFirstTurn: isFirstTurnOf(refreshed),
  });
}

export function stopStreaming(): void {
  chatRun.cancel();
}
