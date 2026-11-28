import {
  DEFAULT_MODEL,
  MODEL_PRESETS,
  modelSupportsImages,
  resolveModel,
} from '../src/domain/settings/models';
import {DEFAULT_SETTINGS} from '../src/domain/settings/types';

describe('model catalog', () => {
  it('keeps the default model in the preset list', () => {
    expect(DEFAULT_SETTINGS.model).toBe(DEFAULT_MODEL);
    expect(MODEL_PRESETS.map(preset => preset.value)).toContain(DEFAULT_MODEL);
  });

  it('has unique preset values in catalog order', () => {
    const values = MODEL_PRESETS.map(preset => preset.value);
    expect(values).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
    expect(new Set(values).size).toBe(values.length);
    expect(MODEL_PRESETS.every(preset => preset.label === preset.value)).toBe(
      true,
    );
  });

  it('resolves blank and padded model names', () => {
    expect(resolveModel('')).toBe(DEFAULT_MODEL);
    expect(resolveModel('   ')).toBe(DEFAULT_MODEL);
    expect(resolveModel('  deepseek-v4-pro  ')).toBe('deepseek-v4-pro');
  });

  it('reports image support from the same catalog', () => {
    expect(modelSupportsImages('deepseek-flash')).toBe(true);
    expect(modelSupportsImages(' deepseek-flash ')).toBe(true);
    expect(modelSupportsImages('deepseek-v4-pro')).toBe(false);
    expect(modelSupportsImages('deepseek-v4-flash-vision-exp')).toBe(true);
    expect(modelSupportsImages('unknown-model')).toBe(false);
    expect(modelSupportsImages('')).toBe(true);
  });
});
