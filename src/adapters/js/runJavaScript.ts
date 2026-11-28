import type {QuickJSDeferredPromise} from 'quickjs-emscripten-core';
import {JAVASCRIPT_LIMITS} from '../../config/appConfig';

import {loadQuickJS} from './loadQuickJS';
import {
  type CallTool,
  createProgram,
  getToolReply,
  readProgramResult,
  validateCode,
} from './scriptProgram';

let engine: ReturnType<typeof loadQuickJS> | undefined;

interface ToolRequest {
  name: string;
  argumentsText: string;
  reply: QuickJSDeferredPromise;
}

export async function runJavaScript(
  code: string,
  callTool: CallTool,
  signal: AbortSignal,
  toolInputLimits: Record<string, number>,
): Promise<string> {
  validateCode(code);
  const checkAbort = () => {
    if (signal.aborted) {
      throw new Error('JavaScript 执行已停止。');
    }
  };
  checkAbort();
  engine ??= loadQuickJS().catch(error => {
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
      const reply = vm.newPromise();
      requests.push({
        name: JSON.parse(vm.getString(name)),
        argumentsText: vm.getString(args),
        reply,
      });
      return reply.handle;
    }).consume(handle => vm.setProp(vm.global, 'callTool', handle));

    const program = turn(() =>
      vm.evalCode(createProgram(code, toolInputLimits), 'code_exec.js'),
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
          return readProgramResult(
            state.value.consume(value => vm.getString(value)),
          );
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
          getToolReply(
            callTool,
            request.name,
            request.argumentsText,
            controller.signal,
          ),
        ]);
        checkBudget();
        if (response === stop) {
          throw new Error('JavaScript 执行超时。');
        }
        vm.newString(response).consume(request.reply.resolve);
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
