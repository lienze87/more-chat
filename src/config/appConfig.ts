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

export const CHAT_LIMITS = {
  maxToolRounds: 8,
  maxCallsPerRound: 8,
  streamFlushIntervalMs: 40,
  maxTitleInputLength: 60,
} as const;

export const JAVASCRIPT_LIMITS = {
  maxCodeLength: 16_000,
  maxToolInputLength: 4_096,
  maxOutputLength: 12_000,
  maxToolCalls: 32,
  maxToolNameLength: 64,
  maxErrorLength: 512,
  timeoutMs: 5_000,
  maxTurnMs: 100,
  maxMemoryBytes: 8 * 1024 * 1024,
  maxStackBytes: 256 * 1024,
  jobsPerBatch: 16,
} as const;

export const WORKSPACE_ROOT = 'workspace';

export const FILE_LIMITS = {
  maxPathBytes: 170,
  maxWriteTextBytes: 256 * 1024,
  maxImageOutputCharsPerRun: 4 * 1024 * 1024,
  textPageChars: 16_000,
  directoryPageItems: 100,
  maxWritesPerScript: 1,
} as const;

// JSON 可将单个控制字符编码为 6 个字符，另留出路径和参数字段的空间。
export const WRITE_TOOL_INPUT_LIMIT = FILE_LIMITS.maxWriteTextBytes * 6 + 4_096;

export const FILE_SEARCH_LIMITS = {
  maxQueryLength: 120,
  matchesPerPage: 30,
  filesPerPage: 24,
  scanCharsPerPage: 1_000_000,
  previewChars: 240,
  previewCharsBeforeMatch: 60,
} as const;

const SKILL_FILE_BYTES = 1024 * 1024;
export const SKILL_LIMITS = {
  maxFileBytes: SKILL_FILE_BYTES,
  maxPackageBytes: 4 * SKILL_FILE_BYTES,
  maxPackageFiles: 256,
  maxImportBytes: 4 * 1024 * 1024,
  maxNameLength: 64,
  maxDescriptionLength: 1024,
  // GitHub Contents API 的单目录响应上限。
  githubMaxDirectoryEntries: 1_000,
  githubImportTimeoutMs: 45_000,
  githubDownloadBatchSize: 8,
} as const;

export const PERSISTENCE_INTERVALS = {
  defaultThrottleMs: 1_500,
  conversationsThrottleMs: 1_200,
  settingsDebounceMs: 300,
} as const;

export const FILE_EXPORT_TIMING = {
  nativeCacheRetentionMs: 24 * 60 * 60 * 1000,
  webObjectUrlRetentionMs: 1_000,
} as const;
