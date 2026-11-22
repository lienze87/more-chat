import type {ClientToolCall, Conversation} from '../../domain/chat/types';
import type {Settings} from '../../domain/settings/types';
import {DEFAULT_MODEL} from '../../domain/settings/types';
import {composeUserContent} from '../../domain/chat/userMetadata';
import {buildSystemPrompt} from '../../config/defaultSystemPrompt';
import type {ApiMessage, ApiToolCall, ChatCompletionRequest} from './types';

export interface BuildRequestOptions {
  conversation: Conversation;
  settings: Settings;
  /** True before the conversation has produced a complete answer. */
  isFirstTurn: boolean;
}

export function buildApiMessages(
  conversation: Conversation,
  systemPrompt?: string,
): ApiMessage[] {
  const messages: ApiMessage[] = [];
  const system = systemPrompt?.trim();
  if (system) {
    messages.push({role: 'system', content: system});
  }

  for (const message of conversation.messages) {
    if (message.role === 'user') {
      if (message.reminder) {
        messages.push({role: 'latest_reminder', content: message.reminder});
      }
      // 环境快照与用户请求分开包裹：历史消息回放时仍保留当时的环境。
      messages.push({
        role: 'user',
        content: composeUserContent(message.content, message.envInfo),
      });
      continue;
    }

    // Do not replay failed or refused turns: they carry no usable context.
    if (message.status === 'error' || message.status === 'refused') {
      continue;
    }
    const hasContent = message.content.trim().length > 0;
    const hasTools = message.serverToolCalls.length > 0;
    const hasClientTools = message.clientToolCalls.length > 0;
    if (!hasContent && !hasTools && !hasClientTools) {
      continue;
    }

    const assistant: Extract<ApiMessage, {role: 'assistant'}> = {
      role: 'assistant',
      content: message.content,
    };
    if (message.reasoning) {
      assistant.reasoning_content = message.reasoning;
    }
    if (hasTools) {
      assistant.server_tool_calls = message.serverToolCalls;
    }
    if (hasClientTools) {
      assistant.tool_calls = message.clientToolCalls.map(toApiToolCall);
    }
    messages.push(assistant);

    // 客户端工具的返回值必须紧跟在触发它的 assistant 之后，否则服务端会拒收。
    for (const call of message.clientToolCalls) {
      const result = toolResultContent(call);
      if (result === null) {
        continue;
      }
      messages.push({role: 'tool', tool_call_id: call.id, content: result});
    }
  }

  return messages;
}

const toApiToolCall = (call: ClientToolCall): ApiToolCall => ({
  id: call.id,
  type: 'function',
  function: {name: call.name, arguments: call.argumentsText || '{}'},
});

/** 只有执行完成的调用才有可回传的内容；仍在运行的不补空结果。 */
const toolResultContent = (call: ClientToolCall): string | null => {
  if (call.status === 'completed') {
    return call.result ?? '';
  }
  if (call.status === 'failed') {
    return call.error ? `错误：${call.error}` : '工具执行失败';
  }
  return null;
};

export function buildChatRequest({
  conversation,
  settings,
  isFirstTurn,
}: BuildRequestOptions): ChatCompletionRequest {
  const request: ChatCompletionRequest = {
    model: settings.model.trim() || DEFAULT_MODEL,
    // 内置提示词始终发送，设置页内容只是追加在它后面的附加要求。
    messages: buildApiMessages(
      conversation,
      buildSystemPrompt(settings.systemPrompt),
    ),
    stream: true,
    thinking: {type: settings.thinking ? 'enabled' : 'disabled'},
    safety_check: {level: settings.safetyLevel},
  };

  if (settings.thinking) {
    request.reasoning_effort = settings.reasoningEffort;
  }

  const tools: ChatCompletionRequest['tools'] = [];
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
        message.clientToolCalls.length > 0),
  );
