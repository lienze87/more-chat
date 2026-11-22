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

/**
 * POST + incremental read over XMLHttpRequest.
 *
 * React Native does not expose response.body streaming on every runtime, but
 * XHR `responseText` grows progressively on Android, which is what the official
 * SSE libraries rely on as well.
 */
export function openSseTransport(
  options: SseTransportOptions,
): SseTransportHandle {
  const xhr = new XMLHttpRequest();
  const parser = new SseParser();
  let offset = 0;
  let completed = false;
  let status = 0;
  let onAbortRequested = false;

  const cleanup = () => {
    options.signal?.removeEventListener?.('abort', handleSignalAbort);
  };

  const settle = (fn: () => void) => {
    if (completed) {
      return;
    }
    completed = true;
    cleanup();
    fn();
  };

  const pump = () => {
    const text = xhr.responseText ?? '';
    if (text.length <= offset) {
      return;
    }
    const fragment = text.slice(offset);
    offset = text.length;
    for (const event of parser.push(fragment)) {
      options.onEvent(event);
    }
  };

  const fail = (error: ApiError) => {
    settle(() => options.onError(error));
  };

  const handleSignalAbort = () => {
    onAbortRequested = true;
    xhr.abort();
  };

  xhr.open('POST', options.url, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  for (const [name, value] of Object.entries(options.headers)) {
    xhr.setRequestHeader(name, value);
  }
  if (options.timeoutMs && options.timeoutMs > 0) {
    xhr.timeout = options.timeoutMs;
  }

  xhr.onreadystatechange = () => {
    status = xhr.status;
    if (xhr.readyState === 3) {
      if (status === 0 || (status >= 200 && status < 300)) {
        pump();
      }
      return;
    }
    if (xhr.readyState !== 4) {
      return;
    }

    if (onAbortRequested) {
      settle(() => options.onDone());
      return;
    }

    if (status >= 200 && status < 300) {
      pump();
      for (const event of parser.flush()) {
        options.onEvent(event);
      }
      settle(() => options.onDone());
      return;
    }

    const message = parseErrorMessage(xhr.responseText ?? '');
    fail(
      new ApiError(message || `请求失败（HTTP ${status || '未知'}）`, {status}),
    );
  };

  xhr.onprogress = () => {
    if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
      pump();
    }
  };

  xhr.onerror = () => {
    fail(new ApiError('网络连接失败，请检查网络后重试。'));
  };

  xhr.ontimeout = () => {
    fail(new ApiError('请求超时，请稍后重试。'));
  };

  xhr.onabort = () => {
    settle(() => options.onDone());
  };

  if (options.signal) {
    if (options.signal.aborted) {
      onAbortRequested = true;
      xhr.abort();
      return {abort: () => undefined};
    }
    options.signal.addEventListener('abort', handleSignalAbort);
  }

  xhr.send(options.body);

  return {
    abort: () => {
      onAbortRequested = true;
      xhr.abort();
    },
  };
}
