export interface ApiErrorOptions {
  status?: number;
  code?: string;
}

export class ApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('尚未配置 DeepSeek API Key');
    this.name = 'MissingApiKeyError';
  }
}

const NETWORK_HINTS = ['network', 'failed to fetch', 'timeout', 'connect'];

/**
 * Turns low level transport failures into actionable Chinese copy.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const {status, message} = error;
    if (status === 400) {
      if (message.includes('Content Exists Risk')) {
        return '输入内容未通过安全检查，请修改后重试。';
      }
      return message || '请求参数有误（400）。';
    }
    if (status === 401) {
      return 'API Key 无效或已过期，请在设置中检查。';
    }
    if (status === 402) {
      return '账户余额不足，请前往 DeepSeek 开放平台充值。';
    }
    if (status === 403) {
      return '当前 API Key 没有访问权限。';
    }
    if (status === 404) {
      return '接口地址不存在，请检查 Base URL（默认 https://api.deepseek.com）。';
    }
    if (status === 429) {
      return '请求过于频繁，请稍后再试。';
    }
    if (status && status >= 500) {
      return 'DeepSeek 服务暂时不可用，请稍后重试。';
    }
    return message || '请求失败，请稍后重试。';
  }

  if (error instanceof MissingApiKeyError) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message || '';
    if (NETWORK_HINTS.some(hint => message.toLowerCase().includes(hint))) {
      return '网络连接失败，请检查网络后重试。';
    }
    return message;
  }

  return '发生未知错误，请稍后重试。';
}
