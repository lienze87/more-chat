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

interface ActiveRun extends StreamingState {
  cancel: () => void;
}

type RunOutcome =
  | {kind: 'done'}
  | {kind: 'aborted'}
  | {kind: 'error'; error: unknown};

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

  const start = (run: ChatRunRequest): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const {conversationId, assistantId} = run;
      const state: {handle?: StreamChatHandle; outcome?: RunOutcome} = {};
      const current: ActiveRun = {
        conversationId,
        messageId: assistantId,
        cancel: () => {
          if (state.outcome) {
            return;
          }
          finish({kind: 'aborted'});
          state.handle?.abort();
        },
      };

      function finish(result: RunOutcome): void {
        if (active !== current || state.outcome) {
          return;
        }
        state.outcome = result;
        try {
          flush();
          const message = findMessage(conversationId, assistantId);
          if (message) {
            deps.updateAssistantMessage(
              conversationId,
              assistantId,
              previous => {
                if (result.kind === 'aborted') {
                  return markAborted(previous);
                }
                if (
                  previous.status === 'complete' ||
                  previous.status === 'refused'
                ) {
                  return previous;
                }
                if (result.kind === 'error') {
                  return markFailed(previous, describeError(result.error));
                }
                if (previous.status === 'awaiting_tool') {
                  return markFailed(
                    previous,
                    '当前版本无法执行客户端工具，请重新生成。',
                  );
                }
                return applyFinishReason(previous, 'stop');
              },
            );
            if (result.kind !== 'error' && message.title) {
              deps.applyAutoTitle(conversationId, message.title);
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          active = null;
          deps.setStreaming(null);
        }
      }

      active = current;
      deps.setStreaming({conversationId, messageId: assistantId});
      if (active !== current) {
        return;
      }

      try {
        state.handle = deps.stream({
          apiKey: run.apiKey,
          baseUrl: run.baseUrl,
          request: run.request,
          timeoutMs: run.timeoutMs,
          onChunk: chunk => {
            if (active === current && !state.outcome) {
              pending.push(chunk);
              scheduleFlush();
            }
          },
          onDone: () => finish({kind: 'done'}),
          onError: error => finish({kind: 'error', error}),
        });
        if (state.outcome?.kind === 'aborted') {
          state.handle.abort();
        }
      } catch (error) {
        finish({kind: 'error', error});
      }
    });

  const cancelConversation = (conversationId: string | null): void => {
    if (!active) {
      return;
    }
    if (conversationId !== null && active.conversationId !== conversationId) {
      return;
    }
    active.cancel();
  };

  return {
    start,
    cancel: () => active?.cancel(),
    cancelConversation,
    isRunning: () => active !== null,
  };
}
