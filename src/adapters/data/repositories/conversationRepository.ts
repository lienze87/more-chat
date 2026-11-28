import {STORAGE_KEYS} from '../../../config/appConfig';
import type {
  ChatMessage,
  ClientToolCall,
  Conversation,
} from '../../../domain/chat/types';
import {conversationSchema} from '../../../domain/chat/schema';
import {readJson, writeJson} from '../storage/jsonStorage';

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
    const raw = await readJson(STORAGE_KEYS.conversations);
    const conversations: Conversation[] = [];
    if (Array.isArray(raw)) {
      for (const value of raw) {
        const parsed = conversationSchema.safeParse(value);
        if (parsed.success) {
          conversations.push(parsed.data);
        }
      }
    }
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
