import type {ChatCompletionChunk, ChatCompletionRequest} from './types';
import {ApiError} from './errors';
import {openSseTransport, SseTransportHandle} from './sseTransport';

export interface StreamChatOptions {
  apiKey: string;
  baseUrl: string;
  request: ChatCompletionRequest;
  signal?: AbortSignal;
  timeoutMs?: number;
  onChunk: (chunk: ChatCompletionChunk) => void;
  onDone: () => void;
  onError: (error: ApiError) => void;
}

export interface StreamChatHandle {
  abort: () => void;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  const base = trimmed || 'https://api.deepseek.com';
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  return `${base}/chat/completions`;
}

export function streamChatCompletion(
  options: StreamChatOptions,
): StreamChatHandle {
  const {apiKey, baseUrl, request, signal, timeoutMs} = options;
  let settled = false;
  let transport: SseTransportHandle | null = null;

  const finishWithError = (error: ApiError) => {
    if (settled) {
      return;
    }
    settled = true;
    options.onError(error);
  };

  const finishNormally = () => {
    if (settled) {
      return;
    }
    settled = true;
    options.onDone();
  };

  transport = openSseTransport({
    url: chatCompletionsUrl(baseUrl),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(request),
    signal,
    timeoutMs,
    onEvent: event => {
      const data = event.data?.trim();
      if (data === '[DONE]') {
        transport?.abort();
        return;
      }
      if (!data) {
        return;
      }
      let parsed: ChatCompletionChunk & {
        error?: {message?: string; code?: string};
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (parsed.error) {
        finishWithError(
          new ApiError(parsed.error.message ?? '服务返回错误', {
            code: parsed.error.code,
          }),
        );
        transport?.abort();
        return;
      }
      options.onChunk(parsed);
    },
    onDone: finishNormally,
    onError: finishWithError,
  });

  return {
    abort: () => transport?.abort(),
  };
}
