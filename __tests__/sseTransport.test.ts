import {ApiError} from '../src/adapters/api/errors';
import {
  openSseTransport,
  type SseTransportOptions,
} from '../src/adapters/api/sseTransport';
import type {SseEvent} from '../src/adapters/api/sseParser';

/**
 * 可控的 XMLHttpRequest 替身。
 *
 * `sseTransport` 的所有状态都来自 XHR 的事件回调，因此这里只需要复现
 * readyState / status / responseText 三个可读写字段，再提供两个驱动器：
 * `streamChunk`（等价于 readyState=3 的增量）与 `complete`（readyState=4）。
 */
class FakeXhr {
  static instances: FakeXhr[] = [];

  readyState = 0;
  status = 0;
  responseText = '';
  timeout = 0;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: string | null = null;
  aborted = false;

  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: string): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  /** 模拟服务端继续吐字节（readyState=3）。 */
  streamChunk(text: string, status = 200): void {
    this.status = status;
    this.responseText += text;
    this.readyState = 3;
    this.onreadystatechange?.();
  }

  /** 模拟连接结束（readyState=4）。 */
  complete(status: number, text = ''): void {
    this.status = status;
    this.responseText += text;
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

interface Harness {
  handle: {abort: () => void};
  xhr: FakeXhr;
  events: SseEvent[];
  onDone: jest.Mock;
  onError: jest.Mock;
}

function open(overrides: Partial<SseTransportOptions> = {}): Harness {
  const events: SseEvent[] = [];
  const onDone = jest.fn();
  const onError = jest.fn();
  const handle = openSseTransport({
    url: 'https://api.deepseek.com/chat/completions',
    headers: {Authorization: 'Bearer sk-test'},
    body: '{"stream":true}',
    onEvent: event => events.push(event),
    onDone,
    onError,
    ...overrides,
  });
  return {handle, xhr: FakeXhr.instances[0], events, onDone, onError};
}

describe('openSseTransport', () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    (globalThis as unknown as {XMLHttpRequest: unknown}).XMLHttpRequest =
      FakeXhr;
  });

  it('streams incremental events and finishes exactly once', () => {
    const {xhr, events, onDone, onError} = open();

    expect(xhr.method).toBe('POST');
    expect(xhr.headers.Authorization).toBe('Bearer sk-test');
    expect(xhr.headers.Accept).toBe('text/event-stream');
    expect(xhr.body).toBe('{"stream":true}');

    xhr.streamChunk('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(events.map(event => event.data)).toEqual(['{"a":1}', '{"b":2}']);

    xhr.complete(200);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('only reads the newly appended tail of responseText', () => {
    const {xhr, events} = open();

    xhr.streamChunk('data: a\n\n');
    xhr.streamChunk('data: b\n\n');
    xhr.streamChunk('data: c');

    // 最后一个事件还没有空行结尾，不会提前派发。
    expect(events.map(event => event.data)).toEqual(['a', 'b']);

    xhr.complete(200);
    expect(events.map(event => event.data)).toEqual(['a', 'b', 'c']);
  });

  it('flushes a trailing event when the connection closes', () => {
    const {xhr, events, onDone} = open();

    xhr.streamChunk('data: {"tail":true}');
    xhr.complete(200);

    expect(events.map(event => event.data)).toEqual(['{"tail":true}']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('turns a non-2xx response into an ApiError with the server message', () => {
    const {xhr, onDone, onError} = open();

    xhr.complete(401, '{"error":{"message":"Invalid API key"}}');

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Invalid API key');
    expect(error.status).toBe(401);
  });

  it('falls back to a readable message when the error body is not JSON', () => {
    const {xhr, onError} = open();

    xhr.complete(502, 'Bad Gateway');

    const error = onError.mock.calls[0][0] as ApiError;
    expect(error.message).toBe('Bad Gateway');
    expect(error.status).toBe(502);
  });

  it('treats an explicit abort as a normal completion', () => {
    const {handle, xhr, onDone, onError} = open();

    handle.abort();

    expect(xhr.aborted).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports timeouts and network failures as errors', () => {
    const timeout = open();
    timeout.xhr.ontimeout?.();
    expect((timeout.onError.mock.calls[0][0] as ApiError).message).toContain(
      '请求超时',
    );

    FakeXhr.instances = [];
    const offline = open();
    offline.xhr.onerror?.();
    expect((offline.onError.mock.calls[0][0] as ApiError).message).toContain(
      '网络连接失败',
    );
  });

  it('finishes immediately when the signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();

    const {xhr, onDone, onError} = open({signal: controller.signal});

    expect(xhr.body).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('applies the timeout setting to the underlying request', () => {
    const {xhr} = open({timeoutMs: 1234});
    expect(xhr.timeout).toBe(1234);
  });
});
