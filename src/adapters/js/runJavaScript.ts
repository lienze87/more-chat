import type {QuickJSDeferredPromise} from 'quickjs-emscripten-core';
import {JAVASCRIPT_LIMITS} from '../../config/appConfig';

async function loadEngine() {
  const [{default: variant}, {newQuickJSWASMModuleFromVariant}] =
    await Promise.all([
      import('@jitl/quickjs-asmjs-mjs-release-sync'),
      import('quickjs-emscripten-core'),
    ]);
  return newQuickJSWASMModuleFromVariant(variant);
}

let engine: ReturnType<typeof loadEngine> | undefined;

interface ToolRequest {
  name: string;
  argumentsText: string;
  reply: QuickJSDeferredPromise;
}

export async function runJavaScript(
  code: string,
  callTool: (
    name: string,
    argumentsText: string,
    signal: AbortSignal,
  ) => Promise<string>,
  signal: AbortSignal,
  toolInputLimits: Record<string, number>,
): Promise<string> {
  if (!code.trim() || code.length > JAVASCRIPT_LIMITS.maxCodeLength) {
    throw new Error(
      `请提供 1 到 ${JAVASCRIPT_LIMITS.maxCodeLength} 字符的 JavaScript。`,
    );
  }
  const checkAbort = () => {
    if (signal.aborted) {
      throw new Error('JavaScript 执行已停止。');
    }
  };
  checkAbort();
  engine ??= loadEngine().catch(error => {
    engine = undefined;
    throw error;
  });
  const module = await engine;
  checkAbort();

  const vm = module.newContext();
  const {runtime} = vm;
  const requests: ToolRequest[] = [];
  const controller = new AbortController();
  const stop = Symbol();
  let stopWaiting!: () => void;
  const stopped = new Promise<typeof stop>(resolve => {
    stopWaiting = () => {
      controller.abort();
      resolve(stop);
    };
  });
  signal.addEventListener('abort', stopWaiting);
  const timer = setTimeout(stopWaiting, JAVASCRIPT_LIMITS.timeoutMs);
  const deadline = performance.now() + JAVASCRIPT_LIMITS.timeoutMs;
  let turnDeadline = deadline;
  let interrupted = false;
  let calls = 0;
  const checkBudget = () => {
    checkAbort();
    if (interrupted || performance.now() >= deadline) {
      throw new Error('JavaScript 执行超时。');
    }
  };
  const turn = <T>(run: () => T): T => {
    checkBudget();
    turnDeadline = Math.min(
      deadline,
      performance.now() + JAVASCRIPT_LIMITS.maxTurnMs,
    );
    return run();
  };

  try {
    runtime.setMemoryLimit(JAVASCRIPT_LIMITS.maxMemoryBytes);
    runtime.setMaxStackSize(JAVASCRIPT_LIMITS.maxStackBytes);
    runtime.setInterruptHandler(() => {
      interrupted ||= signal.aborted || performance.now() >= turnDeadline;
      return interrupted;
    });

    vm.newFunction('callTool', (name, args) => {
      if (++calls > JAVASCRIPT_LIMITS.maxToolCalls) {
        throw new Error(
          `每次执行最多调用 ${JAVASCRIPT_LIMITS.maxToolCalls} 次工具。`,
        );
      }
      const reply = vm.newPromise();
      requests.push({
        name: JSON.parse(vm.getString(name)),
        argumentsText: vm.getString(args),
        reply,
      });
      return reply.handle;
    }).consume(handle => vm.setProp(vm.global, 'callTool', handle));

    const program = turn(() =>
      vm.evalCode(
        `
        (async () => {
          const bridge = globalThis.callTool;
          delete globalThis.callTool;
          const {parse, stringify} = JSON;
          const slice = Function.call.bind(String.prototype.slice);
          const inputLimits = Object.assign(Object.create(null), ${JSON.stringify(toolInputLimits)});
          const tools = Object.freeze({
            async call(name, input = {}) {
              if (typeof name !== 'string' || name.length > ${JAVASCRIPT_LIMITS.maxToolNameLength}) {
                throw new TypeError('工具名无效。');
              }
              const args = stringify(input);
              if (args === undefined || args.length > (inputLimits[name] ?? ${JAVASCRIPT_LIMITS.maxToolInputLength})) {
                throw new TypeError('工具参数必须是有界的 JSON 对象。');
              }
              return parse(await bridge(stringify(name), args));
            }
          });
          try {
            const AsyncFunction = (async () => {}).constructor;
            const value = await new AsyncFunction('tools', ${JSON.stringify(code)})(tools);
            const json = stringify(value === undefined ? null : value);
            if (json === undefined || json.length > ${JAVASCRIPT_LIMITS.maxOutputLength}) {
              throw new Error('请返回不超过 ${JAVASCRIPT_LIMITS.maxOutputLength} 字符的 JSON 值或文本。');
            }
            return '+' + json;
          } catch (error) {
            const message = typeof error === 'string' ? error : error?.message;
            return '-' + stringify(typeof message === 'string' ? slice(message, 0, ${JAVASCRIPT_LIMITS.maxErrorLength}) : '脚本执行失败。');
          }
        })()
      `,
        'code_exec.js',
      ),
    );
    if (program.error) {
      program.error.dispose();
      checkBudget();
      throw new Error('无法启动 JavaScript 脚本。');
    }

    try {
      while (true) {
        checkBudget();
        const state = vm.getPromiseState(program.value);
        if (state.type === 'fulfilled') {
          const output = state.value.consume(value => vm.getString(value));
          const json = output.slice(1);
          const value: unknown = JSON.parse(json);
          if (output[0] === '-') {
            throw new Error(
              typeof value === 'string' ? value : '脚本执行失败。',
            );
          }
          return typeof value === 'string' ? value : json;
        }
        if (state.type === 'rejected') {
          state.error.dispose();
          throw new Error('脚本执行失败。');
        }

        if (runtime.hasPendingJob()) {
          const jobs = turn(() =>
            runtime.executePendingJobs(JAVASCRIPT_LIMITS.jobsPerBatch),
          );
          if (jobs.error) {
            jobs.error.dispose();
            checkBudget();
            throw new Error('脚本异步任务执行失败。');
          }
          // 在连续的 Promise 任务之间让出 App 的 JS 线程。
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          continue;
        }

        const request = requests[0];
        if (!request) {
          throw new Error('脚本停在一个无法完成的 Promise 上。');
        }
        const response = await Promise.race([
          stopped,
          callTool(request.name, request.argumentsText, controller.signal).then(
            text => ({text}),
            (error: unknown) => ({
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        ]);
        checkBudget();
        if (response === stop) {
          throw new Error('JavaScript 执行超时。');
        }
        if ('error' in response) {
          vm.newError(
            response.error.slice(0, JAVASCRIPT_LIMITS.maxErrorLength),
          ).consume(request.reply.reject);
        } else {
          vm.newString(response.text).consume(request.reply.resolve);
        }
        request.reply.dispose();
        requests.shift();
      }
    } finally {
      program.value.dispose();
    }
  } finally {
    controller.abort();
    clearTimeout(timer);
    signal.removeEventListener('abort', stopWaiting);
    for (const {reply} of requests) {
      reply.dispose();
    }
    vm.dispose();
  }
}
