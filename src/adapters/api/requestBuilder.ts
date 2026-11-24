import type {
  AssistantToolRound,
  ClientToolCall,
  Conversation,
} from '../../domain/chat/types';
import type {Settings} from '../../domain/settings/types';
import {DEFAULT_MODEL} from '../../domain/settings/types';
import {composeUserContent} from '../../domain/chat/userMetadata';
import {buildSystemPrompt} from '../../config/defaultSystemPrompt';
import type {
  ApiFunctionTool,
  ApiMessage,
  ApiToolCall,
  ChatCompletionRequest,
} from './types';

export interface BuildRequestOptions {
  conversation: Conversation;
  settings: Settings;
  /** True before the conversation has produced a complete answer. */
  isFirstTurn: boolean;
  clientTools?: ApiFunctionTool[];
  toolPrompt?: string;
}

export function buildApiMessages(
  conversation: Conversation,
  systemPrompt?: string,
  imageResults?: ReadonlyMap<string, string>,
): ApiMessage[] {
  const messages: ApiMessage[] = [];
  const system = systemPrompt?.trim();
  if (system) {
    messages.push({role: 'system', content: system});
  }

  for (const message of conversation.messages) {
    if (message.role === 'user') {
      messages.push({role: 'latest_reminder', content: message.reminder});
      // 环境快照与用户请求分开包裹：历史消息回放时仍保留当时的环境。
      messages.push({
        role: 'user',
        content: composeUserContent(message.content, message.envInfo),
      });
      continue;
    }

    for (const round of message.toolRounds ?? []) {
      appendAssistantRound(messages, round, imageResults);
    }
    if (message.status !== 'error' && message.status !== 'refused') {
      appendAssistantRound(messages, message, imageResults);
    }
  }

  return messages;
}

function appendAssistantRound(
  messages: ApiMessage[],
  round: Omit<AssistantToolRound, 'segmentEnd'>,
  imageResults?: ReadonlyMap<string, string>,
): void {
  const clientCalls = round.clientToolCalls.filter(
    call => call.status !== 'running',
  );
  const hasServerTools = round.serverToolCalls.length > 0;
  if (!round.content.trim() && !hasServerTools && !clientCalls.length) {
    return;
  }

  const assistant: Extract<ApiMessage, {role: 'assistant'}> = {
    role: 'assistant',
    content: round.content,
  };
  if (round.reasoning) {
    assistant.reasoning_content = round.reasoning;
  }
  if (hasServerTools) {
    assistant.server_tool_calls = round.serverToolCalls;
  }
  if (clientCalls.length) {
    assistant.tool_calls = clientCalls.map(toApiToolCall);
  }
  messages.push(assistant);

  for (const call of clientCalls) {
    const text =
      call.status === 'completed'
        ? (call.result ?? '')
        : call.error
          ? `错误：${call.error}`
          : '工具执行失败';
    const url = imageResults?.get(call.id);
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: url
        ? [
            {type: 'text', text},
            {type: 'image_url', image_url: {url}},
          ]
        : text,
    });
  }
}

const toApiToolCall = (call: ClientToolCall): ApiToolCall => ({
  id: call.id,
  type: 'function',
  function: {name: call.name, arguments: call.argumentsText || '{}'},
});

export function buildChatRequest({
  conversation,
  settings,
  isFirstTurn,
  clientTools = [],
  toolPrompt,
}: BuildRequestOptions): ChatCompletionRequest {
  const request: ChatCompletionRequest = {
    model: settings.model.trim() || DEFAULT_MODEL,
    // 内置提示词始终发送，设置页内容只是追加在它后面的附加要求。
    messages: buildApiMessages(
      conversation,
      [buildSystemPrompt(settings.systemPrompt), toolPrompt]
        .filter(Boolean)
        .join('\n\n'),
    ),
    stream: true,
    thinking: {type: settings.thinking ? 'enabled' : 'disabled'},
    safety_check: {level: settings.safetyLevel},
  };

  if (settings.thinking) {
    request.reasoning_effort = settings.reasoningEffort;
  }

  const tools: ChatCompletionRequest['tools'] = [...clientTools];
  if (settings.webSearch) {
    tools.push({type: 'deepseek_web_search'});
  }
  if (settings.readUrl) {
    tools.push({type: 'deepseek_read_url'});
  }
  if (tools.length > 0) {
    request.tools = tools;
  }

  if (settings.autoTitle && isFirstTurn) {
    request.title = {enabled: true};
  }

  return request;
}

export const isFirstTurnOf = (conversation: Conversation): boolean =>
  !conversation.messages.some(
    message =>
      message.role === 'assistant' &&
      (message.content.trim().length > 0 ||
        message.serverToolCalls.length > 0 ||
        message.clientToolCalls.length > 0 ||
        !!message.toolRounds?.length),
  );
