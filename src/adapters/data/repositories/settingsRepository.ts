import {STORAGE_KEYS} from '../../../config/appConfig';
import {normalizeSettings} from '../../../domain/settings/normalize';
import type {Settings} from '../../../domain/settings/types';
import {readJson, writeJson} from '../storage/jsonStorage';

export interface Credentials {
  apiKey: string;
}

export const settingsRepository = {
  async load(): Promise<Settings> {
    const raw = await readJson<unknown>(STORAGE_KEYS.settings, null);
    return normalizeSettings(raw);
  },
  async save(settings: Settings): Promise<void> {
    await writeJson(STORAGE_KEYS.settings, settings);
  },
};

export const credentialsRepository = {
  async load(): Promise<Credentials> {
    const raw = await readJson<Partial<Credentials>>(STORAGE_KEYS.credentials, {
      apiKey: '',
    });
    return {apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : ''};
  },
  async save(credentials: Credentials): Promise<void> {
    await writeJson(STORAGE_KEYS.credentials, credentials);
  },
};
