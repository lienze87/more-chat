export const APP_VERSION = '0.1.0';

export const STORAGE_KEYS = {
  settings: '@morechat/settings/v1',
  conversations: '@morechat/conversations/v1',
} as const;

export const MAX_INPUT_LENGTH = 8000;

export const DEFAULT_REFUSAL_MESSAGE =
  '该内容未通过安全检查，请修改提问后重试。';

export const NETWORK_TIMEOUT_MS = 300_000;
