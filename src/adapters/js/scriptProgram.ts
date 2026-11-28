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

  const install = (name, value) => {
    if (typeof globalThis[name] === 'undefined') {
      Object.defineProperty(globalThis, name, {value, writable: false, configurable: false});
    }
  };

  class Utf8Encoder {
    get encoding() { return 'utf-8'; }
    encode(input = '') {
      const text = String(input);
      const bytes = [];
      for (let index = 0; index < text.length; index += 1) {
        let code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
          const next = text.charCodeAt(index + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
            index += 1;
          }
        }
        if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
        if (code < 0x80) {
          bytes.push(code);
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        } else if (code < 0x10000) {
          bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        } else {
          bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
      }
      return new Uint8Array(bytes);
    }
  }

  class Utf8Decoder {
    constructor(label = 'utf-8') {
      const normalized = String(label).toLowerCase();
      if (normalized !== 'utf-8' && normalized !== 'utf8' && normalized !== 'unicode-1-1-utf-8') {
        throw new RangeError('TextDecoder 仅支持 UTF-8。');
      }
    }
    get encoding() { return 'utf-8'; }
    decode(input) {
      let bytes;
      if (input === undefined) {
        bytes = new Uint8Array(0);
      } else if (input instanceof Uint8Array) {
        bytes = input;
      } else if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
      } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      } else {
        throw new TypeError('TextDecoder 需要 ArrayBuffer 或 Uint8Array。');
      }
      const replacement = String.fromCharCode(0xfffd);
      let output = '';
      let index = 0;
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        index = 3;
      }
      while (index < bytes.length) {
        const first = bytes[index];
        index += 1;
        if (first < 0x80) {
          output += String.fromCharCode(first);
          continue;
        }
        if (first >= 0xc2 && first <= 0xdf) {
          if (index >= bytes.length || (bytes[index] & 0xc0) !== 0x80) {
            output += replacement;
            continue;
          }
          output += String.fromCharCode(((first & 0x1f) << 6) | (bytes[index] & 0x3f));
          index += 1;
          continue;
        }
        if (first >= 0xe0 && first <= 0xef) {
          if (index + 1 >= bytes.length || (bytes[index] & 0xc0) !== 0x80 || (bytes[index + 1] & 0xc0) !== 0x80) {
            output += replacement;
            continue;
          }
          const code = ((first & 0x0f) << 12) | ((bytes[index] & 0x3f) << 6) | (bytes[index + 1] & 0x3f);
          index += 2;
          output += code < 0x800 || (code >= 0xd800 && code <= 0xdfff) ? replacement : String.fromCharCode(code);
          continue;
        }
        if (first >= 0xf0 && first <= 0xf4) {
          if (index + 2 >= bytes.length || (bytes[index] & 0xc0) !== 0x80 || (bytes[index + 1] & 0xc0) !== 0x80 || (bytes[index + 2] & 0xc0) !== 0x80) {
            output += replacement;
            continue;
          }
          const code = ((first & 0x07) << 18) | ((bytes[index] & 0x3f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f);
          index += 3;
          output += code < 0x10000 || code > 0x10ffff ? replacement : String.fromCodePoint(code);
          continue;
        }
        output += replacement;
      }
      return output;
    }
  }

  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function btoa(value) {
    const input = String(value);
    let output = '';
    for (let index = 0; index < input.length; index += 3) {
      const first = input.charCodeAt(index);
      const second = index + 1 < input.length ? input.charCodeAt(index + 1) : 0;
      const third = index + 2 < input.length ? input.charCodeAt(index + 2) : 0;
      if (first > 255 || second > 255 || third > 255) {
        throw new Error('btoa 只接受 Latin-1 字符。');
      }
      const triple = (first << 16) | (second << 8) | third;
      output += base64Chars[(triple >> 18) & 63];
      output += base64Chars[(triple >> 12) & 63];
      output += index + 1 < input.length ? base64Chars[(triple >> 6) & 63] : '=';
      output += index + 2 < input.length ? base64Chars[triple & 63] : '=';
    }
    return output;
  }
  function atob(value) {
    const input = String(value).replace(/[\\t\\n\\f\\r ]/g, '');
    if (input.length % 4 === 1) {
      throw new Error('无效的 base64 字符串。');
    }
    let data = input;
    if (data.endsWith('==')) {
      data = slice(data, 0, -2);
    } else if (data.endsWith('=')) {
      data = slice(data, 0, -1);
    }
    if (data.includes('=')) {
      throw new Error('无效的 base64 字符串。');
    }
    let buffer = 0;
    let bits = 0;
    let output = '';
    for (let index = 0; index < data.length; index += 1) {
      const valueIndex = base64Chars.indexOf(data[index]);
      if (valueIndex < 0) {
        throw new Error('无效的 base64 字符串。');
      }
      buffer = (buffer << 6) | valueIndex;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 255);
      }
    }
    return output;
  }

  install('TextEncoder', Utf8Encoder);
  install('TextDecoder', Utf8Decoder);
  install('atob', atob);
  install('btoa', btoa);
  if (typeof globalThis.queueMicrotask === 'undefined') {
    install('queueMicrotask', callback => {
      if (typeof callback !== 'function') {
        throw new TypeError('queueMicrotask 需要函数。');
      }
      Promise.resolve().then(callback);
    });
  }

  const trace = [];
  const logs = [];
  const record = entry => {
    trace.push(entry);
    if (trace.length > 8) trace.shift();
  };
  const formatLog = value => {
    if (typeof value === 'string') return value;
    try {
      const json = stringify(value);
      return json === undefined ? String(value) : json;
    } catch {
      return String(value);
    }
  };
  const writeLog = (...args) => {
    logs.push(slice(args.map(formatLog).join(' '), 0, 200));
    if (logs.length > 5) logs.shift();
  };
  const scriptConsole = Object.freeze({log: writeLog, warn: writeLog, error: writeLog});
  install('console', scriptConsole);

  let calls = 0;
  const inputLimits = Object.assign(Object.create(null), ${JSON.stringify(toolInputLimits)});
  const tools = Object.freeze({
    async call(name, input = {}) {
      let recorded = false;
      const fail = error => {
        if (!recorded) {
          recorded = true;
          record(String(name) + '(失败)');
        }
        throw error;
      };
      try {
        if (typeof name !== 'string' || name.length > ${JAVASCRIPT_LIMITS.maxToolNameLength}) {
          fail(new TypeError('工具名无效。'));
        }
        const args = stringify(input);
        if (args === undefined || args.length > (inputLimits[name] ?? ${JAVASCRIPT_LIMITS.maxToolInputLength})) {
          fail(new TypeError('工具参数必须是有界的 JSON 对象。'));
        }
        if (calls >= ${JAVASCRIPT_LIMITS.maxToolCalls}) {
          fail(new Error('每次执行最多调用 ${JAVASCRIPT_LIMITS.maxToolCalls} 次工具（已调用 ${JAVASCRIPT_LIMITS.maxToolCalls} 次）。'));
        }
        calls += 1;
        const reply = await bridge(stringify(name), args);
        if (reply[0] === '-') {
          fail(new Error(slice(reply, 1)));
        }
        const result = parse(slice(reply, 1));
        record(String(name) + '(ok)');
        return result;
      } catch (error) {
        if (!recorded) {
          recorded = true;
          record(String(name) + '(失败)');
        }
        throw error;
      }
    },
    get remainingCalls() {
      return ${JAVASCRIPT_LIMITS.maxToolCalls} - calls;
    }
  });
  try {
    const AsyncFunction = (async () => {}).constructor;
    const value = await new AsyncFunction('tools', 'console', ${JSON.stringify(code)})(tools, scriptConsole);
    const json = stringify(value === undefined ? null : value);
    if (json === undefined || json.length > ${JAVASCRIPT_LIMITS.maxOutputLength}) {
      throw new Error('请返回不超过 ${JAVASCRIPT_LIMITS.maxOutputLength} 字符的 JSON 值或文本。');
    }
    return '+' + json;
  } catch (error) {
    const message = typeof error === 'string' ? error : error?.message;
    const text = typeof message === 'string' ? message : '脚本执行失败。';
    const details = [];
    if (trace.length) details.push('最近工具调用：' + trace.join('、'));
    if (logs.length) details.push('最近日志：' + logs.join(' | '));
    const suffix = slice(details.length ? ' ' + details.join('；') : '', 0, ${JAVASCRIPT_LIMITS.maxErrorLength} / 2);
    const budget = Math.max(0, ${JAVASCRIPT_LIMITS.maxErrorLength} - suffix.length);
    return '-' + stringify(slice(slice(text, 0, budget) + suffix, 0, ${JAVASCRIPT_LIMITS.maxErrorLength}));
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
