import {STORAGE_KEYS} from '../../../config/appConfig';
import type {
  ChatMessage,
  ClientToolCall,
  Conversation,
} from '../../../domain/chat/types';
import {readJson, writeJson} from '../storage/jsonStorage';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isMessage(value: unknown): value is ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.status !== 'string'
  ) {
    return false;
  }
  if (value.role === 'user') {
    return (
      typeof value.envInfo === 'string' && typeof value.reminder === 'string'
    );
  }
  return (
    value.role === 'assistant' &&
    typeof value.reasoning === 'string' &&
    typeof value.activeStep === 'number' &&
    Array.isArray(value.annotations) &&
    Array.isArray(value.segments) &&
    value.segments.every(
      segment =>
        isRecord(segment) &&
        (segment.kind !== 'thinking' ||
          typeof segment.startedAt === 'number') &&
        (segment.kind !== 'client_tool' || isRecord(segment.call)),
    ) &&
    Array.isArray(value.serverToolCalls) &&
    Array.isArray(value.clientToolCalls) &&
    value.clientToolCalls.every(isRecord) &&
    (value.toolRounds === undefined || Array.isArray(value.toolRounds))
  );
}

function isConversation(value: unknown): value is Conversation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.titleSource === 'auto' ||
      value.titleSource === 'user' ||
      value.titleSource === 'fallback') &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage)
  );
}

function restoreToolCall(call: ClientToolCall): ClientToolCall {
  return call.status === 'running'
    ? {...call, status: 'failed', error: '工具调用已中断。'}
    : call;
}

function restoreMessage(message: ChatMessage, updatedAt: number): ChatMessage {
  if (message.role !== 'assistant') {
    return message;
  }

  const interrupted =
    message.status === 'streaming' || message.status === 'awaiting_tool';
  return {
    ...message,
    status: interrupted ? 'aborted' : message.status,
    clientToolCalls: message.clientToolCalls.map(restoreToolCall),
    segments: message.segments.map(segment => {
      if (segment.kind === 'client_tool') {
        return {...segment, call: restoreToolCall(segment.call)};
      }
      if (interrupted && segment.kind === 'thinking' && !segment.done) {
        return {
          ...segment,
          done: true,
          endedAt: Math.max(updatedAt, segment.startedAt),
        };
      }
      return segment;
    }),
  };
}

export const conversationRepository = {
  async load(): Promise<Conversation[]> {
    const raw = await readJson<unknown>(STORAGE_KEYS.conversations, []);
    const conversations = Array.isArray(raw) ? raw.filter(isConversation) : [];
    for (const conversation of conversations) {
      conversation.messages = conversation.messages.map(message =>
        restoreMessage(message, conversation.updatedAt),
      );
    }
    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async save(conversations: Conversation[]): Promise<void> {
    await writeJson(STORAGE_KEYS.conversations, conversations);
  },
};
