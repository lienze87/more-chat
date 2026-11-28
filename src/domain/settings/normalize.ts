import {DEFAULT_SETTINGS, type Settings} from './types';
import {
  isOneOf,
  REMINDER_LANGUAGES,
  REASONING_EFFORTS,
  SAFETY_LEVELS,
  THEME_MODES,
} from './options';

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

  return {
    baseUrl:
      asString(raw.baseUrl, DEFAULT_SETTINGS.baseUrl).trim() ||
      DEFAULT_SETTINGS.baseUrl,
    model:
      asString(raw.model, DEFAULT_SETTINGS.model).trim() ||
      DEFAULT_SETTINGS.model,
    systemPrompt: asString(raw.systemPrompt, DEFAULT_SETTINGS.systemPrompt),
    thinking: asBool(raw.thinking, DEFAULT_SETTINGS.thinking),
    reasoningEffort: isOneOf(REASONING_EFFORTS, raw.reasoningEffort)
      ? raw.reasoningEffort
      : DEFAULT_SETTINGS.reasoningEffort,
    webSearch: asBool(raw.webSearch, DEFAULT_SETTINGS.webSearch),
    readUrl: asBool(raw.readUrl, DEFAULT_SETTINGS.readUrl),
    safetyLevel: isOneOf(SAFETY_LEVELS, raw.safetyLevel)
      ? raw.safetyLevel
      : DEFAULT_SETTINGS.safetyLevel,
    autoTitle: asBool(raw.autoTitle, DEFAULT_SETTINGS.autoTitle),
    language: isOneOf(REMINDER_LANGUAGES, raw.language)
      ? raw.language
      : DEFAULT_SETTINGS.language,
    location: asString(raw.location, DEFAULT_SETTINGS.location),
    themeMode: isOneOf(THEME_MODES, raw.themeMode)
      ? raw.themeMode
      : DEFAULT_SETTINGS.themeMode,
  };
}
