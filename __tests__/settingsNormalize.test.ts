import {normalizeSettings} from '../src/domain/settings/normalize';
import {
  REMINDER_LANGUAGES,
  REASONING_EFFORTS,
  SAFETY_LEVELS,
  THEME_MODES,
} from '../src/domain/settings/options';
import {DEFAULT_SETTINGS} from '../src/domain/settings/types';

describe('normalizeSettings', () => {
  it('returns defaults for invalid input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and repairs invalid enums', () => {
    const settings = normalizeSettings({
      baseUrl: ' https://example.com ',
      model: ' custom-model ',
      thinking: false,
      reasoningEffort: 'ultra',
      safetyLevel: 'invalid',
      themeMode: 'sepia',
      language: 'English',
      location: 'Tokyo',
    });

    expect(settings.baseUrl).toBe('https://example.com');
    expect(settings.model).toBe('custom-model');
    expect(settings.thinking).toBe(false);
    expect(settings.reasoningEffort).toBe(DEFAULT_SETTINGS.reasoningEffort);
    expect(settings.safetyLevel).toBe(DEFAULT_SETTINGS.safetyLevel);
    expect(settings.themeMode).toBe(DEFAULT_SETTINGS.themeMode);
    expect(settings.language).toBe('English');
    expect(settings.location).toBe('Tokyo');
  });

  it('falls back to the default base url when blank', () => {
    expect(normalizeSettings({baseUrl: '  '}).baseUrl).toBe(
      DEFAULT_SETTINGS.baseUrl,
    );
  });

  it('accepts every value declared by the shared option lists', () => {
    for (const reasoningEffort of REASONING_EFFORTS) {
      expect(normalizeSettings({reasoningEffort}).reasoningEffort).toBe(
        reasoningEffort,
      );
    }
    for (const safetyLevel of SAFETY_LEVELS) {
      expect(normalizeSettings({safetyLevel}).safetyLevel).toBe(safetyLevel);
    }
    for (const themeMode of THEME_MODES) {
      expect(normalizeSettings({themeMode}).themeMode).toBe(themeMode);
    }
    for (const language of REMINDER_LANGUAGES) {
      expect(normalizeSettings({language}).language).toBe(language);
    }
  });
});
