import type {
  ChatCompletionRequest,
  ChatCompletionChunk,
} from '../../adapters/api/types';
import type {
  StreamChatHandle,
  StreamChatOptions,
} from '../../adapters/api/chatClient';
import {buildApiMessages} from '../../adapters/api/requestBuilder';
import {describeError} from '../../adapters/api/errors';
import type {
  AssistantMessage,
  ClientToolCall,
  Conversation,
} from '../../domain/chat/types';
import type {FileToolResult} from '../extensions/fileTools';
import {
  applyFinishReason,
  continueAfterTools,
  markAborted,
  markFailed,
  upsertClientToolCall,
} from './streamReducer';

interface ActiveRun extends StreamingState {
  cancel: () => void;
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
  executeTool: (
    call: ClientToolCall,
    signal: AbortSignal,
  ) => Promise<FileToolResult>;
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
const MAX_TOOL_ROUNDS = 8;
const MAX_CALLS_PER_ROUND = 8;

export function createChatRunController(deps: ChatRunDeps): ChatRunController {
  let active: ActiveRun | null = null;

  function streamRound(
    run: ChatRunRequest,
    request: ChatCompletionRequest,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let pending: ChatCompletionChunk[] = [];
      let timer: unknown = null;
      let handle: StreamChatHandle | undefined;
      let finished = false;

      const flush = () => {
        if (timer !== null) {
          deps.timer.clear(timer);
          timer = null;
        }
        if (pending.length) {
          const chunks = pending;
          pending = [];
          deps.appendAssistantChunks(
            run.conversationId,
            run.assistantId,
            chunks,
          );
        }
      };

      const finish = (error?: unknown) => {
        if (finished) {
          return;
        }
        finished = true;
        signal.removeEventListener('abort', abort);
        try {
          flush();
          if (error !== undefined) {
            reject(error);
          } else {
            resolve();
          }
        } catch (flushError) {
          reject(flushError);
        }
      };

      const abort = () => {
        finish();
        handle?.abort();
      };
      signal.addEventListener('abort', abort);

      try {
        handle = deps.stream({
          apiKey: run.apiKey,
          baseUrl: run.baseUrl,
          request,
          timeoutMs: run.timeoutMs,
          onChunk: chunk => {
            if (finished) {
              return;
            }
            pending.push(chunk);
            if (timer === null) {
              timer = deps.timer.set(() => {
                timer = null;
                try {
                  flush();
                } catch (error) {
                  finish(error);
                  handle?.abort();
                }
              }, FLUSH_INTERVAL_MS);
            }
          },
          onDone: () => finish(),
          onError: finish,
        });
        if (signal.aborted) {
          handle.abort();
        }
      } catch (error) {
        finish(error);
      }
    });
  }

  async function start(run: ChatRunRequest): Promise<void> {
    if (active) {
      return;
    }
    const {conversationId, assistantId} = run;
    const controller = new AbortController();
    const {signal} = controller;
    active = {
      conversationId,
      messageId: assistantId,
      cancel: () => controller.abort(),
    };
    const conversation = () =>
      deps.getConversations().find(item => item.id === conversationId);
    const assistant = () =>
      conversation()?.messages.find(
        (item): item is AssistantMessage =>
          item.id === assistantId && item.role === 'assistant',
      );
    const update = (updater: (message: AssistantMessage) => AssistantMessage) =>
      deps.updateAssistantMessage(conversationId, assistantId, updater);

    try {
      deps.setStreaming({conversationId, messageId: assistantId});
      const system = run.request.messages[0];
      const imageResults = new Map<string, string>();
      const supported = new Set(
        (run.request.tools ?? []).flatMap(tool =>
          tool.type === 'function' ? [tool.function.name] : [],
        ),
      );
      let request = run.request;
      for (let round = 0; !signal.aborted; round += 1) {
        await streamRound(run, request, signal);
        if (signal.aborted) {
          break;
        }
        const message = assistant();
        if (!message) {
          break;
        }
        if (message.status !== 'awaiting_tool') {
          if (message.status === 'streaming') {
            update(previous =>
              previous.clientToolCalls.some(call => call.status === 'running')
                ? markFailed(previous, '工具调用未完整返回，请重试。')
                : applyFinishReason(previous, 'stop'),
            );
          }
          if (message.title) {
            deps.applyAutoTitle(conversationId, message.title);
          }
          break;
        }
        const calls = message.clientToolCalls;
        if (!calls.length || calls.some(call => !supported.has(call.name))) {
          throw new Error('模型请求了不可用的客户端工具。');
        }
        if (round >= MAX_TOOL_ROUNDS || calls.length > MAX_CALLS_PER_ROUND) {
          throw new Error('本次回答已达到工具调用上限。');
        }

        for (const call of calls) {
          let result: ClientToolCall;
          try {
            const output = await run.executeTool(call, signal);
            if (output.imageUrl) {
              imageResults.set(call.id, output.imageUrl);
            }
            result = {...call, status: 'completed', result: output.text};
          } catch (error) {
            result = {...call, status: 'failed', error: describeError(error)};
          }
          if (signal.aborted) {
            break;
          }
          update(previous => upsertClientToolCall(previous, result));
        }
        if (signal.aborted) {
          break;
        }
        update(continueAfterTools);
        const current = conversation();
        if (!current) {
          break;
        }
        request = {
          ...run.request,
          messages: buildApiMessages(
            current,
            system?.role === 'system' ? system.content : undefined,
            imageResults,
          ),
          title: undefined,
        };
      }
      if (signal.aborted) {
        update(markAborted);
        const title = assistant()?.title;
        if (title) {
          deps.applyAutoTitle(conversationId, title);
        }
      }
    } catch (error) {
      update(previous => {
        if (signal.aborted) {
          return markAborted(previous);
        }
        if (previous.status === 'complete' || previous.status === 'refused') {
          return previous;
        }
        return markFailed(previous, describeError(error));
      });
    } finally {
      active = null;
      deps.setStreaming(null);
    }
  }

  return {
    start,
    cancel: () => active?.cancel(),
    cancelConversation: conversationId => {
      if (
        active &&
        (conversationId === null || active.conversationId === conversationId)
      ) {
        active.cancel();
      }
    },
    isRunning: () => active !== null,
  };
}
