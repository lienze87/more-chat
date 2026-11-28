import {DEFAULT_MODEL} from './models';
import type {
  ReasoningEffort,
  ReminderLanguage,
  SafetyLevel,
  ThemeMode,
} from './options';

export type {
  ReasoningEffort,
  ReminderLanguage,
  SafetyLevel,
  ThemeMode,
} from './options';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com';

export interface Settings {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  thinking: boolean;
  reasoningEffort: ReasoningEffort;
  webSearch: boolean;
  readUrl: boolean;
  safetyLevel: SafetyLevel;
  autoTitle: boolean;
  language: ReminderLanguage;
  location: string;
  themeMode: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  systemPrompt: '',
  thinking: true,
  reasoningEffort: 'high',
  webSearch: true,
  readUrl: true,
  safetyLevel: 'high',
  autoTitle: true,
  language: '中文',
  location: '',
  themeMode: 'system',
};
