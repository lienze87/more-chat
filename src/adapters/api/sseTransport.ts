import {fetch} from 'expo/fetch';
import {ApiError} from './errors';
import {SseEvent, SseParser} from './sseParser';

export interface SseTransportOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
  onDone: () => void;
  onError: (error: ApiError) => void;
}

export interface SseTransportHandle {
  abort: () => void;
}

const parseErrorMessage = (raw: string): string => {
  if (!raw) {
    return '';
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: {message?: string} | string;
      message?: string;
    };
    if (typeof parsed.error === 'string') {
      return parsed.error;
    }
    return parsed.error?.message ?? parsed.message ?? raw;
  } catch {
    return raw;
  }
};

/** 通过 Expo Fetch 读取 SSE 字节流，跨分片解码 UTF-8。 */
export function openSseTransport(
  options: SseTransportOptions,
): SseTransportHandle {
  const controller = new AbortController();
  let completed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const finish = (error?: ApiError) => {
    if (completed) {
      return;
    }
    completed = true;
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    if (error) {
      options.onError(error);
    } else {
      options.onDone();
    }
  };

  const abort = () => {
    if (!completed) {
      controller.abort();
      finish();
    }
  };

  async function receive() {
    try {
      const response = await fetch(options.url, {
        method: 'POST',
        headers: {...options.headers, Accept: 'text/event-stream'},
        body: options.body,
        signal: controller.signal,
      });

      if (completed) {
        return;
      }
      if (!response.ok) {
        const message = parseErrorMessage(await response.text());
        finish(
          new ApiError(message || `请求失败（HTTP ${response.status}）`, {
            status: response.status,
          }),
        );
        return;
      }
      if (!response.body) {
        finish(new ApiError('服务未返回响应流。'));
        return;
      }

      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      const emit = (events: SseEvent[]) => {
        for (const event of events) {
          if (completed) {
            break;
          }
          options.onEvent(event);
        }
      };
      try {
        for (;;) {
          if (completed) {
            break;
          }
          const {done, value} = await reader.read();
          if (done) {
            emit(parser.push(decoder.decode()));
            emit(parser.flush());
            finish();
            break;
          }
          emit(parser.push(decoder.decode(value, {stream: true})));
        }
      } finally {
        reader.releaseLock();
      }
    } catch {
      finish(new ApiError('网络连接失败，请检查网络后重试。'));
    }
  }

  if (options.signal?.aborted) {
    abort();
    return {abort};
  }
  options.signal?.addEventListener('abort', abort, {once: true});
  if (options.timeoutMs && options.timeoutMs > 0) {
    timeout = setTimeout(() => {
      controller.abort();
      finish(new ApiError('请求超时，请稍后重试。'));
    }, options.timeoutMs);
  }
  void receive();
  return {abort};
}
