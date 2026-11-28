import {JAVASCRIPT_LIMITS} from '../../config/appConfig';

export type CallTool = (
  name: string,
  argumentsText: string,
  signal: AbortSignal,
) => Promise<string>;

export function validateCode(code: string): void {
  if (!code.trim() || code.length > JAVASCRIPT_LIMITS.maxCodeLength) {
    throw new Error(
      `请提供 1 到 ${JAVASCRIPT_LIMITS.maxCodeLength} 字符的 JavaScript。`,
    );
  }
}

export function createProgram(
  code: string,
  toolInputLimits: Record<string, number>,
): string {
  return `
(async () => {
  const bridge = globalThis.callTool;
  delete globalThis.callTool;
  const {parse, stringify} = JSON;
  const slice = Function.call.bind(String.prototype.slice);
  let calls = 0;
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
      if (++calls > ${JAVASCRIPT_LIMITS.maxToolCalls}) {
        throw new Error('每次执行最多调用 ${JAVASCRIPT_LIMITS.maxToolCalls} 次工具。');
      }
      const reply = await bridge(stringify(name), args);
      if (reply[0] === '-') throw new Error(slice(reply, 1));
      return parse(slice(reply, 1));
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
`;
}

export function readProgramResult(output: string): string {
  const json = output.slice(1);
  const value: unknown = JSON.parse(json);
  if (output[0] === '-') {
    throw new Error(typeof value === 'string' ? value : '脚本执行失败。');
  }
  return typeof value === 'string' ? value : json;
}

export async function getToolReply(
  callTool: CallTool,
  name: string,
  argumentsText: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    return '+' + (await callTool(name, argumentsText, signal));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return '-' + message.slice(0, JAVASCRIPT_LIMITS.maxErrorLength);
  }
}
