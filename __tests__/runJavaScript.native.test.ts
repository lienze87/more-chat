import {requireOptionalNativeModule} from 'expo';
import {runJavaScript} from '../src/adapters/js/runJavaScript.native';
import {JAVASCRIPT_LIMITS} from '../src/config/appConfig';

jest.mock('expo', () => ({requireOptionalNativeModule: jest.fn()}));

type ToolRequest = {
  runId: number;
  requestId: number;
  name: string;
  argumentsText: string;
};

function mockNative() {
  let sendToolRequest!: (request: ToolRequest) => void;
  let complete!: (result: string) => void;
  let runId!: number;
  const remove = jest.fn();
  const native = {
    addListener: jest.fn((_, listener: typeof sendToolRequest) => {
      sendToolRequest = listener;
      return {remove};
    }),
    evaluate: jest.fn(
      (id: number) =>
        new Promise<string>(resolve => {
          runId = id;
          complete = resolve;
        }),
    ),
    reply: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  return {
    native,
    remove,
    complete: (result: string) => complete(result),
    request: (id = runId) =>
      sendToolRequest({
        runId: id,
        requestId: 1,
        name: '"read_file"',
        argumentsText: '{"path":"workspace/a.txt"}',
      }),
    get runId() {
      return runId;
    },
  };
}

it('routes a tool reply to its originating native execution', async () => {
  const session = mockNative();
  const callTool = jest.fn().mockResolvedValue('{"content":"hi"}');
  const result = runJavaScript(
    'return await tools.call("read_file");',
    callTool,
    new AbortController().signal,
    {},
  );

  session.request(session.runId + 1);
  expect(callTool).not.toHaveBeenCalled();
  session.request();
  await Promise.resolve();
  await Promise.resolve();

  expect(callTool).toHaveBeenCalledWith(
    'read_file',
    '{"path":"workspace/a.txt"}',
    expect.any(AbortSignal),
  );
  expect(session.native.reply).toHaveBeenCalledWith(
    session.runId,
    1,
    '+{"content":"hi"}',
  );
  expect(session.native.evaluate).toHaveBeenCalledWith(
    session.runId,
    expect.any(String),
    JAVASCRIPT_LIMITS.maxMemoryBytes,
    JAVASCRIPT_LIMITS.maxStackBytes,
    JAVASCRIPT_LIMITS.timeoutMs,
  );
  session.complete('+"hi"');
  await expect(result).resolves.toBe('hi');
  expect(session.remove).toHaveBeenCalledTimes(1);
});

it('stops the native execution and discards a late tool response on cancellation', async () => {
  const session = mockNative();
  const controller = new AbortController();
  let finishTool!: (result: string) => void;
  const callTool = jest.fn(
    () =>
      new Promise<string>(resolve => {
        finishTool = resolve;
      }),
  );
  const result = runJavaScript(
    'return await tools.call("read_file");',
    callTool,
    controller.signal,
    {},
  );

  session.request();
  controller.abort();
  expect(session.native.cancel).toHaveBeenCalledWith(session.runId);
  finishTool('{"content":"late"}');
  session.complete('+"late"');
  await expect(result).rejects.toThrow('执行已停止');
  expect(session.native.reply).not.toHaveBeenCalled();
  expect(session.remove).toHaveBeenCalledTimes(1);
});
