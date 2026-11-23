import {create} from 'zustand';
import type {
  AssistantMessage,
  ChatMessage,
  Conversation,
} from '../../domain/chat/types';
import {applyStreamChunk} from './streamReducer';
import type {ChatCompletionChunk} from '../../adapters/api/types';
import {createId} from '../../domain/chat/ids';
import {conversationRepository} from '../../adapters/data/repositories/conversationRepository';
import {createThrottledSaver} from '../../adapters/data/persistence';
import {fallbackTitle} from '../../utils/text';
import type {StreamingState} from './chatRun';

export type {StreamingState};

interface ChatState {
  conversations: Conversation[];
  streaming: StreamingState | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  createConversation: () => Conversation;
  deleteConversation: (conversationId: string) => void;
  deleteAllConversations: () => void;
  renameConversation: (conversationId: string, title: string) => void;
  clearMessages: (conversationId: string) => void;
  startExchange: (
    conversationId: string,
    userMessage: ChatMessage,
    assistantMessage: AssistantMessage,
  ) => void;
  addAssistantMessage: (
    conversationId: string,
    assistantMessage: AssistantMessage,
  ) => void;
  appendAssistantChunks: (
    conversationId: string,
    messageId: string,
    chunks: ChatCompletionChunk[],
  ) => void;
  updateAssistantMessage: (
    conversationId: string,
    messageId: string,
    updater: (message: AssistantMessage) => AssistantMessage,
  ) => void;
  /** 丢弃从 messageId 开始的全部消息（含它本身），用于从某条回复重写。 */
  truncateFrom: (conversationId: string, messageId: string) => void;
  applyAutoTitle: (conversationId: string, title: string) => void;
  setStreaming: (streaming: StreamingState | null) => void;
}

const conversationsSaver = createThrottledSaver<Conversation[]>(
  conversations => conversationRepository.save(conversations),
  1200,
);

function persist(): void {
  conversationsSaver.schedule(useChatStore.getState().conversations);
}

export function flushConversations(): Promise<void> {
  return conversationsSaver.flush();
}

const touch = (conversation: Conversation): Conversation => ({
  ...conversation,
  updatedAt: Date.now(),
});

export const useChatStore = create<ChatState>()(set => ({
  conversations: [],
  streaming: null,
  hydrated: false,

  hydrate: async () => {
    const conversations = await conversationRepository.load();
    set({conversations, hydrated: true, streaming: null});
  },

  createConversation: () => {
    const now = Date.now();
    const conversation: Conversation = {
      id: createId('conv'),
      title: '新对话',
      titleSource: 'fallback',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    set(state => ({conversations: [conversation, ...state.conversations]}));
    persist();
    return conversation;
  },

  deleteConversation: conversationId => {
    set(state => ({
      conversations: state.conversations.filter(
        conversation => conversation.id !== conversationId,
      ),
    }));
    persist();
  },

  deleteAllConversations: () => {
    set({conversations: []});
    persist();
  },

  renameConversation: (conversationId, title) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    set(state => ({
      conversations: state.conversations.map(conversation =>
        conversation.id === conversationId
          ? {
              ...touch(conversation),
              title: nextTitle,
              titleSource: 'user',
            }
          : conversation,
      ),
    }));
    persist();
  },

  clearMessages: conversationId => {
    set(state => ({
      conversations: state.conversations.map(conversation =>
        conversation.id === conversationId
          ? {...touch(conversation), messages: []}
          : conversation,
      ),
    }));
    persist();
  },

  startExchange: (conversationId, userMessage, assistantMessage) => {
    set(state => ({
      conversations: state.conversations.map(conversation => {
        if (conversation.id !== conversationId) {
          return conversation;
        }
        const shouldSetTitle =
          conversation.messages.length === 0 &&
          conversation.titleSource !== 'user';
        return {
          ...touch(conversation),
          title: shouldSetTitle
            ? fallbackTitle(userMessage.content)
            : conversation.title,
          messages: [...conversation.messages, userMessage, assistantMessage],
        };
      }),
    }));
    persist();
  },

  addAssistantMessage: (conversationId, assistantMessage) => {
    set(state => ({
      conversations: state.conversations.map(conversation =>
        conversation.id === conversationId
          ? {
              ...touch(conversation),
              messages: [...conversation.messages, assistantMessage],
            }
          : conversation,
      ),
    }));
    persist();
  },

  appendAssistantChunks: (conversationId, messageId, chunks) => {
    if (chunks.length === 0) {
      return;
    }
    set(state => ({
      conversations: state.conversations.map(conversation => {
        if (conversation.id !== conversationId) {
          return conversation;
        }
        let changed = false;
        const messages = conversation.messages.map(message => {
          if (message.id !== messageId || message.role !== 'assistant') {
            return message;
          }
          let next = message;
          for (const chunk of chunks) {
            next = applyStreamChunk(next, chunk);
          }
          changed = true;
          return next;
        });
        return changed ? {...touch(conversation), messages} : conversation;
      }),
    }));
    persist();
  },

  updateAssistantMessage: (conversationId, messageId, updater) => {
    set(state => ({
      conversations: state.conversations.map(conversation => {
        if (conversation.id !== conversationId) {
          return conversation;
        }
        let changed = false;
        const messages = conversation.messages.map(message => {
          if (message.id !== messageId || message.role !== 'assistant') {
            return message;
          }
          const next = updater(message);
          changed = next !== message;
          return next;
        });
        return changed ? {...touch(conversation), messages} : conversation;
      }),
    }));
    persist();
  },

  truncateFrom: (conversationId, messageId) => {
    set(state => ({
      conversations: state.conversations.map(conversation => {
        if (conversation.id !== conversationId) {
          return conversation;
        }
        const index = conversation.messages.findIndex(
          message => message.id === messageId,
        );
        if (index < 0) {
          return conversation;
        }
        return {
          ...touch(conversation),
          messages: conversation.messages.slice(0, index),
        };
      }),
    }));
    persist();
  },

  applyAutoTitle: (conversationId, title) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    set(state => ({
      conversations: state.conversations.map(conversation =>
        conversation.id === conversationId &&
        conversation.titleSource !== 'user'
          ? {...conversation, title: nextTitle, titleSource: 'auto'}
          : conversation,
      ),
    }));
    persist();
  },

  setStreaming: streaming => set({streaming}),
}));

export const sortConversationsByRecency = (
  conversations: Conversation[],
): Conversation[] =>
  conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt);

export const latestConversationId = (): string | undefined => {
  const {conversations} = useChatStore.getState();
  return sortConversationsByRecency(conversations)[0]?.id;
};

/**
 * 应用启动后进入的对话。
 *
 * 优先复用最近一个空白对话，避免每次冷启动都多出一条“新对话”；没有空白
 * 对话时再新建，保证首页始终停在一个可以直接输入的新会话上。
 */
export function ensureLaunchConversation(): Conversation {
  const {conversations, createConversation} = useChatStore.getState();
  // 取“最近的一个空白对话”，而不是“最近对话若恰好空白”——后者会在最近
  // 对话已有内容时新开一条，让旧的空白对话永远留在列表里。
  const blank = sortConversationsByRecency(conversations).find(
    conversation => conversation.messages.length === 0,
  );
  if (blank) {
    return blank;
  }
  return createConversation();
}
