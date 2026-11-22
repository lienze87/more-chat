import type {
  ChatCompletionRequest,
  ChatCompletionChunk,
} from '../../adapters/api/types';
import type {
  StreamChatHandle,
  StreamChatOptions,
} from '../../adapters/api/chatClient';
import {describeError} from '../../adapters/api/errors';
import type {AssistantMessage, Conversation} from '../../domain/chat/types';
import {applyFinishReason, markAborted, markFailed} from './streamReducer';

/** 一次进行中的生成。stopRequested 属于这一轮，不再是全局开关。 */
export interface ActiveRun {
  conversationId: string;
  messageId: string;
  stopRequested: boolean;
  abort: () => void;
}

export interface StreamingState {
  conversationId: string;
  messageId: string;
}

export interface ChatRunTimer {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

/**
 * 运行时对外的全部副作用。
 *
 * 只声明“需要什么”，不引用具体 store：控制器因此可以在测试里用假实现驱动，
 * 也不会反向依赖 React / zustand。
 */
export interface ChatRunDeps {
  stream: (options: StreamChatOptions) => StreamChatHandle;
  getConversations: () => Conversation[];
  setStreaming: (streaming: StreamingState | null) => void;
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
  applyAutoTitle: (conversationId: string, title: string) => void;
  timer: ChatRunTimer;
}

export interface ChatRunRequest {
  conversationId: string;
  assistantId: string;
  request: ChatCompletionRequest;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface ChatRunController {
  /** 启动一轮生成；返回的 Promise 在收到终止事件后 resolve。 */
  start: (run: ChatRunRequest) => Promise<void>;
  /** 中止当前轮，若存在。 */
  cancel: () => void;
  /** 仅当当前轮属于该对话时中止；传 null 表示全部中止。 */
  cancelConversation: (conversationId: string | null) => void;
  isRunning: () => boolean;
  activeRun: () => ActiveRun | null;
}

const FLUSH_INTERVAL_MS = 40;

export function createChatRunController(deps: ChatRunDeps): ChatRunController {
  let active: ActiveRun | null = null;
  let pending: ChatCompletionChunk[] = [];
  let flushTimer: unknown = null;

  const findConversation = (conversationId: string): Conversation | undefined =>
    deps.getConversations().find(item => item.id === conversationId);

  const findMessage = (
    conversationId: string,
    messageId: string,
  ): AssistantMessage | undefined => {
    const message = findConversation(conversationId)?.messages.find(
      item => item.id === messageId,
    );
    return message && message.role === 'assistant' ? message : undefined;
  };

  const clearFlushTimer = (): void => {
    if (flushTimer !== null) {
      deps.timer.clear(flushTimer);
      flushTimer = null;
    }
  };

  /**
   * 把缓冲的 chunk 一次性写进 store。
   *
   * 流式期间每 40ms 才触发一次 React 更新与 Markdown 重排，而不是每个 token。
   */
  const flush = (): void => {
    clearFlushTimer();
    if (!active || pending.length === 0) {
      pending = [];
      return;
    }
    const chunks = pending;
    pending = [];
    deps.appendAssistantChunks(active.conversationId, active.messageId, chunks);
  };

  const scheduleFlush = (): void => {
    if (flushTimer !== null) {
      return;
    }
    flushTimer = deps.timer.set(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  };

  /** 收尾：清空缓冲、释放运行态、清掉全局 streaming 标记。 */
  const settle = (): void => {
    clearFlushTimer();
    pending = [];
    active = null;
    deps.setStreaming(null);
  };

  const abortActive = (): void => {
    if (!active) {
      return;
    }
    active.stopRequested = true;
    active.abort();
  };

  const start = (run: ChatRunRequest): Promise<void> => {
    const current: ActiveRun = {
      conversationId: run.conversationId,
      messageId: run.assistantId,
      stopRequested: false,
      abort: () => undefined,
    };
    active = current;
    pending = [];
    deps.setStreaming({
      conversationId: run.conversationId,
      messageId: run.assistantId,
    });

    return new Promise<void>(resolve => {
      const handle = deps.stream({
        apiKey: run.apiKey,
        baseUrl: run.baseUrl,
        request: run.request,
        timeoutMs: run.timeoutMs,
        onChunk: chunk => {
          pending.push(chunk);
          scheduleFlush();
        },
        onDone: () => {
          flush();
          const message = findMessage(run.conversationId, run.assistantId);
          if (message) {
            if (current.stopRequested) {
              deps.updateAssistantMessage(
                run.conversationId,
                run.assistantId,
                markAborted,
              );
            } else if (message.status === 'streaming') {
              deps.updateAssistantMessage(
                run.conversationId,
                run.assistantId,
                settled => applyFinishReason(settled, 'stop'),
              );
            }
            const settled = findMessage(run.conversationId, run.assistantId);
            if (settled?.title) {
              deps.applyAutoTitle(run.conversationId, settled.title);
            }
          }
          settle();
          resolve();
        },
        onError: error => {
          flush();
          const message = findMessage(run.conversationId, run.assistantId);
          if (
            message &&
            message.status !== 'complete' &&
            message.status !== 'refused'
          ) {
            const text = describeError(error);
            deps.updateAssistantMessage(
              run.conversationId,
              run.assistantId,
              failed => markFailed(failed, text),
            );
          }
          settle();
          resolve();
        },
      });
      current.abort = handle.abort;
    });
  };

  const cancelConversation = (conversationId: string | null): void => {
    if (!active) {
      return;
    }
    if (conversationId !== null && active.conversationId !== conversationId) {
      return;
    }
    abortActive();
  };

  return {
    start,
    cancel: abortActive,
    cancelConversation,
    isRunning: () => active !== null,
    activeRun: () => active,
  };
}
