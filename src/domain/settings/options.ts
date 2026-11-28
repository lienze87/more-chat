/**
 * 设置枚举的权威定义。
 *
 * 类型与运行时校验共用同一份数组，避免 normalize 里再维护一套字符串列表。
 */

export const REASONING_EFFORTS = ['low', 'high', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const SAFETY_LEVELS = ['high', 'low'] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const REMINDER_LANGUAGES = ['中文', 'English'] as const;
export type ReminderLanguage = (typeof REMINDER_LANGUAGES)[number];

/** 运行时校验：只接受枚举数组里声明过的字符串。 */
export function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
