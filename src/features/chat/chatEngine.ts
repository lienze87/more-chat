import {Platform} from 'react-native';
import {createId} from '../../utils/ids';
import {
  buildEnvInfo,
  buildLatestReminder,
  type RuntimePlatform,
} from '../../domain/chat/userMetadata';
import {enabledServerToolCapabilities} from '../../domain/chat/capabilities';
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
import {useChatStore} from './chatStore';
import {useSettingsStore} from '../settings/settingsStore';
import {createFileTools} from '../extensions/fileTools';
import {useSkillsStore} from '../extensions/skillsStore';
import {modelSupportsImages, resolveModel} from '../../domain/settings/models';
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
    ...enabledServerToolCapabilities(settings).map(
      capability => capability.label,
    ),
    '本地文件',
    'JavaScript 执行',
  ];
}

async function runCompletion(params: {
  conversationId: string;
  assistantId: string;
  isFirstTurn: boolean;
  requestConversation?: Conversation;
}): Promise<void> {
  const {conversationId, assistantId, isFirstTurn} = params;
  const {settings, apiKey} = useSettingsStore.getState();
  const conversation =
    params.requestConversation ?? findConversation(conversationId);
  if (!conversation) {
    return;
  }

  const model = resolveModel(settings.model);
  const skills = useSkillsStore.getState().skills;
  const fileTools = createFileTools(skills, modelSupportsImages(model));
  await chatRun.start({
    conversationId,
    assistantId,
    request: buildChatRequest({
      conversation,
      settings,
      isFirstTurn,
      clientTools: fileTools.definitions,
      toolPrompt: fileTools.prompt,
    }),
    clientTools: fileTools,
    apiKey,
    baseUrl: settings.baseUrl,
    timeoutMs: NETWORK_TIMEOUT_MS,
  });
}

/** 重试失败回复时，只回放它之前的消息，并在原位置更新结果。 */
export async function retryFailedReply(
  conversationId: string,
  messageId: string,
): Promise<void> {
  if (chatRun.isRunning()) {
    return;
  }
  if (!useSettingsStore.getState().apiKey.trim()) {
    throw new MissingApiKeyError();
  }
  const conversation = findConversation(conversationId);
  const index =
    conversation?.messages.findIndex(message => message.id === messageId) ?? -1;
  const previous = conversation?.messages[index];
  if (
    !conversation ||
    previous?.role !== 'assistant' ||
    previous.status !== 'error'
  ) {
    return;
  }
  const requestConversation = {
    ...conversation,
    messages: conversation.messages.slice(0, index),
  };
  if (!requestConversation.messages.some(message => message.role === 'user')) {
    return;
  }

  const {updateAssistantMessage} = useChatStore.getState();
  updateAssistantMessage(conversationId, messageId, () =>
    createAssistantMessage(messageId, previous.createdAt),
  );
  try {
    await runCompletion({
      conversationId,
      assistantId: messageId,
      isFirstTurn: isFirstTurnOf(requestConversation),
      requestConversation,
    });
  } finally {
    updateAssistantMessage(conversationId, messageId, current => {
      if (
        current.status === 'streaming' ||
        current.status === 'awaiting_tool'
      ) {
        return previous;
      }
      if (
        (current.status === 'error' || current.status === 'aborted') &&
        previous.content
      ) {
        return {...previous, status: current.status, error: current.error};
      }
      return current;
    });
  }
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

export function deleteConversation(conversationId: string): void {
  chatRun.cancelConversation(conversationId);
  useChatStore.getState().deleteConversation(conversationId);
}

export function deleteAllConversations(): void {
  chatRun.cancel();
  useChatStore.getState().deleteAllConversations();
}

export function clearMessages(conversationId: string): void {
  chatRun.cancelConversation(conversationId);
  useChatStore.getState().clearMessages(conversationId);
}
