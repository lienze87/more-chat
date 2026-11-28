import {requireOptionalNativeModule} from 'expo';
import {JAVASCRIPT_LIMITS} from '../../config/appConfig';
import {
  type CallTool,
  createProgram,
  getToolReply,
  readProgramResult,
  validateCode,
} from './scriptProgram';

interface ToolRequest {
  runId: number;
  requestId: number;
  name: string;
  argumentsText: string;
}

interface CodeExecModule {
  addListener(
    event: 'toolRequest',
    listener: (request: ToolRequest) => void,
  ): {remove(): void};
  evaluate(
    runId: number,
    program: string,
    memoryLimit: number,
    stackLimit: number,
    timeoutMs: number,
  ): Promise<string>;
  reply(runId: number, requestId: number, response: string): Promise<void>;
  cancel(runId: number): Promise<void>;
}

let nextRunId = 0;

export async function runJavaScript(
  code: string,
  callTool: CallTool,
  signal: AbortSignal,
  toolInputLimits: Record<string, number>,
): Promise<string> {
  validateCode(code);
  if (signal.aborted) {
    throw new Error('JavaScript 执行已停止。');
  }
  const native =
    requireOptionalNativeModule<CodeExecModule>('MoreChatCodeExec');
  if (!native) {
    throw new Error('此应用构建不包含原生 JavaScript 执行模块。');
  }

  const runId = ++nextRunId;
  const controller = new AbortController();
  const subscription = native.addListener('toolRequest', request => {
    if (request.runId !== runId || controller.signal.aborted) return;

    void getToolReply(
      callTool,
      JSON.parse(request.name),
      request.argumentsText,
      controller.signal,
    )
      .then(response => {
        if (controller.signal.aborted) return;
        return native.reply(runId, request.requestId, response);
      })
      .catch(() => {
        // Native execution reports bridge failures or stops at its deadline.
      });
  });

  const stop = () => {
    controller.abort();
    void native.cancel(runId).catch(() => {
      // Native execution has its own deadline.
    });
  };
  signal.addEventListener('abort', stop);
  const timer = setTimeout(stop, JAVASCRIPT_LIMITS.timeoutMs);

  try {
    const result = await native.evaluate(
      runId,
      createProgram(code, toolInputLimits),
      JAVASCRIPT_LIMITS.maxMemoryBytes,
      JAVASCRIPT_LIMITS.maxStackBytes,
      JAVASCRIPT_LIMITS.timeoutMs,
    );
    if (controller.signal.aborted) {
      throw new Error('JavaScript 执行超时。');
    }
    return readProgramResult(result);
  } catch (error) {
    if (signal.aborted) {
      throw new Error('JavaScript 执行已停止。', {cause: error});
    }
    if (controller.signal.aborted) {
      throw new Error('JavaScript 执行超时。', {cause: error});
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    subscription.remove();
    controller.abort();
  }
}
