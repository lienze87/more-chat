import {version} from '../../package.json';

/**
 * 版本号唯一来源：package.json。
 * APK 的 versionName 由 plugins/withPackageVersion.js 在 prebuild 时写入，
 * 设置页展示、请求里的 clientVersion 与安装包始终一致。
 */
export const APP_VERSION = version;

export const STORAGE_KEYS = {
  settings: '@morechat/settings/v1',
  conversations: '@morechat/conversations/v1',
} as const;

export const MAX_INPUT_LENGTH = 8000;

export const DEFAULT_REFUSAL_MESSAGE =
  '该内容未通过安全检查，请修改提问后重试。';

export const NETWORK_TIMEOUT_MS = 300_000;
