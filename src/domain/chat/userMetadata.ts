/**
 * 用户消息附带的上下文快照。
 *
 * - `latest_reminder`：DeepSeek 官方的用户元信息标记，正文是
 *   `<date>,<weekday>,<location>,<platform>,<language>`，必须紧挨在所属的
 *   user 消息之前；
 * - `<env_info>`：客户端发送时记录的应用环境（版本、平台、可用工具），随历史
 *   原样回放；
 * - `<user_query>`：把用户正文包起来，避免上下文与请求混在一起。
 */

import type {ReminderLanguage} from '../settings/types';

export type {ReminderLanguage} from '../settings/types';

const WEEKDAYS_ZH = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
];

const WEEKDAYS_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const pad = (value: number): string => String(value).padStart(2, '0');

/** Local calendar date in YYYY-MM-DD, independent of the device timezone offset. */
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function formatWeekday(date: Date, language: ReminderLanguage): string {
  const weekday =
    language === '中文'
      ? WEEKDAYS_ZH[date.getDay()]
      : WEEKDAYS_EN[date.getDay()];
  return weekday;
}

export interface ReminderOptions {
  language: ReminderLanguage;
  location?: string;
  platform?: 'App' | 'Web';
}

export function buildLatestReminder(
  date: Date,
  options: ReminderOptions,
): string {
  const {language, location = '', platform = 'App'} = options;
  return [
    formatLocalDate(date),
    formatWeekday(date, language),
    location.trim(),
    platform,
    language,
  ].join(',');
}

/** App 实际运行所在的平台，`env_info` 据此给出更细的描述。 */
export type RuntimePlatform = 'android' | 'ios' | 'web';

const PLATFORM_LABELS: Record<RuntimePlatform, string> = {
  android: 'App（Android）',
  ios: 'App（iOS）',
  web: 'Web（浏览器）',
};

export interface EnvInfoOptions {
  clientVersion: string;
  platform: RuntimePlatform;
  /** 当前设置允许使用的服务端工具，例如 ["联网搜索", "阅读链接"]。 */
  capabilities: string[];
}

/**
 * 构建 `<env_info>` 快照。
 *
 * 只放会随版本与设置变化的应用环境；日期、地点、语言属于用户元信息，继续由
 * `latest_reminder` 发送，避免同一条事实重复出现。
 */
export function buildEnvInfo({
  clientVersion,
  platform,
  capabilities,
}: EnvInfoOptions): string {
  const tools = capabilities.length > 0 ? capabilities.join('、') : '无';
  return [
    '<env_info>',
    `客户端: MoreChat ${clientVersion}`,
    `平台: ${PLATFORM_LABELS[platform]}`,
    `可用工具: ${tools}`,
    '</env_info>',
  ].join('\n');
}

/** 把用户正文包进 `<user_query>`，并在需要时带上 `<env_info>` 快照。 */
export function composeUserContent(content: string, envInfo?: string): string {
  const snapshot = envInfo?.trim();
  const query = `<user_query>\n${content}\n</user_query>`;
  return snapshot ? `${snapshot}\n\n${query}` : query;
}
