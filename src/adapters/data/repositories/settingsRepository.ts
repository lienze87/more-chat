import {STORAGE_KEYS} from '../../../config/appConfig';
import {normalizeSettings} from '../../../domain/settings/normalize';
import type {Settings} from '../../../domain/settings/types';
import {readJson, writeJson} from '../storage/jsonStorage';

export const settingsRepository = {
  async load(): Promise<Settings> {
    return normalizeSettings(await readJson(STORAGE_KEYS.settings));
  },
  async save(settings: Settings): Promise<void> {
    await writeJson(STORAGE_KEYS.settings, settings);
  },
};
