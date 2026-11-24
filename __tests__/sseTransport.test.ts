import {fetch} from 'expo/fetch';
import {ApiError} from '../src/adapters/api/errors';
import {
  openSseTransport,
  type SseTransportOptions,
} from '../src/adapters/api/sseTransport';

jest.mock('expo/fetch', () => ({fetch: jest.fn()}));

const mockFetch = jest.mocked(fetch);
const encode = (text: string) => new TextEncoder().encode(text);

function open(overrides: Partial<SseTransportOptions> = {}) {
  const events: string[] = [];
  const onDone = jest.fn();
  const onError = jest.fn();
  let complete!: () => void;
  const finished = new Promise<void>(resolve => {
    complete = resolve;
  });
  const handle = openSseTransport({
    url: 'https://api.deepseek.com/chat/completions',
    headers: {Authorization: 'Bearer sk-test'},
    body: '{"stream":true}',
    onEvent: event => {
      events.push(event.data);
    },
    onDone: () => {
      onDone();
      complete();
    },
    onError: error => {
      onError(error);
      complete();
    },
    ...overrides,
  });
  return {handle, events, onDone, onError, finished};
}

function response(
  body: ReadableStream<Uint8Array> | null,
  status = 200,
  text = '',
) {
  mockFetch.mockResolvedValueOnce({
    body,
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
  } as Awaited<ReturnType<typeof fetch>>);
}

beforeEach(() => {
  mockFetch.mockReset();
});

it('posts an SSE request and decodes UTF-8 across chunks before flushing the tail', async () => {
  const middle = encode('你');
  response(
    new ReadableStream({
      start(stream) {
        stream.enqueue(encode('data: a\n\n'));
        stream.enqueue(encode('data: '));
        stream.enqueue(middle.slice(0, 1));
        stream.enqueue(middle.slice(1));
        stream.close();
      },
    }),
  );
  const {events, onDone, onError, finished} = open();

  expect(mockFetch).toHaveBeenCalledWith(
    'https://api.deepseek.com/chat/completions',
    expect.objectContaining({
      method: 'POST',
      headers: {Accept: 'text/event-stream', Authorization: 'Bearer sk-test'},
      body: '{"stream":true}',
    }),
  );
  await finished;
  expect(events).toEqual(['a', '你']);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it('emits complete events while the response is still open', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  response(
    new ReadableStream({
      start(controller) {
        stream = controller;
      },
    }),
  );
  let receive!: (data: string) => void;
  const firstEvent = new Promise<string>(resolve => {
    receive = resolve;
  });
  const {onDone, finished} = open({onEvent: event => receive(event.data)});
  stream.enqueue(encode('data: early\n\n'));
  await expect(firstEvent).resolves.toBe('early');
  expect(onDone).not.toHaveBeenCalled();
  stream.close();
  await finished;
});

it.each([
  [401, '{"error":{"message":"Invalid API key"}}', 'Invalid API key'],
  [502, 'Bad Gateway', 'Bad Gateway'],
])('reports HTTP %i with the server error', async (status, body, message) => {
  response(null, status, body);
  const {onDone, onError, finished} = open();
  await finished;
  expect(onDone).not.toHaveBeenCalled();
  expect(onError.mock.calls[0][0]).toBeInstanceOf(ApiError);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({status, message}),
  );
});

it('treats an explicit abort as completion and ignores late errors', async () => {
  let reject!: (error: Error) => void;
  mockFetch.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const {handle, onDone, onError, finished} = open();
  handle.abort();
  reject(new Error('cancelled'));
  await finished;
  expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it('does not fetch for an already-aborted signal', () => {
  const controller = new AbortController();
  controller.abort();
  const {onDone, onError} = open({signal: controller.signal});

  expect(mockFetch).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it('aborts the request and reports a timeout at the configured deadline', async () => {
  jest.useFakeTimers();
  try {
    mockFetch.mockImplementationOnce(() => new Promise(() => undefined));
    const {onDone, onError, finished} = open({timeoutMs: 1234});
    jest.advanceTimersByTime(1233);
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await finished;
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('请求超时')}),
    );
    expect(onDone).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('reports connection failures', async () => {
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  const {onError, finished} = open();
  await finished;
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({message: expect.stringContaining('网络连接失败')}),
  );
});
