import {
  DEFAULT_SETTINGS,
  type ReasoningEffort,
  type SafetyLevel,
  type Settings,
  type ThemeMode,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const asBool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export function normalizeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) {
    return {...DEFAULT_SETTINGS};
  }

  const reasoningEffort: ReasoningEffort = ['low', 'high', 'max'].includes(
    raw.reasoningEffort as string,
  )
    ? (raw.reasoningEffort as ReasoningEffort)
    : DEFAULT_SETTINGS.reasoningEffort;

  const safetyLevel: SafetyLevel = ['high', 'low'].includes(
    raw.safetyLevel as string,
  )
    ? (raw.safetyLevel as SafetyLevel)
    : DEFAULT_SETTINGS.safetyLevel;

  const themeMode: ThemeMode = ['system', 'light', 'dark'].includes(
    raw.themeMode as string,
  )
    ? (raw.themeMode as ThemeMode)
    : DEFAULT_SETTINGS.themeMode;

  const language = raw.language === 'English' ? 'English' : '中文';

  return {
    baseUrl:
      asString(raw.baseUrl, DEFAULT_SETTINGS.baseUrl).trim() ||
      DEFAULT_SETTINGS.baseUrl,
    model:
      asString(raw.model, DEFAULT_SETTINGS.model).trim() ||
      DEFAULT_SETTINGS.model,
    systemPrompt: asString(raw.systemPrompt, DEFAULT_SETTINGS.systemPrompt),
    thinking: asBool(raw.thinking, DEFAULT_SETTINGS.thinking),
    reasoningEffort,
    webSearch: asBool(raw.webSearch, DEFAULT_SETTINGS.webSearch),
    readUrl: asBool(raw.readUrl, DEFAULT_SETTINGS.readUrl),
    safetyLevel,
    autoTitle: asBool(raw.autoTitle, DEFAULT_SETTINGS.autoTitle),
    language,
    location: asString(raw.location, DEFAULT_SETTINGS.location),
    themeMode,
  };
}
