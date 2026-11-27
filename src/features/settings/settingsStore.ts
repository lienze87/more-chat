import {create} from 'zustand';
import {PERSISTENCE_INTERVALS} from '../../config/appConfig';
import {DEFAULT_SETTINGS, type Settings} from '../../domain/settings/types';
import {normalizeSettings} from '../../domain/settings/normalize';
import {credentialsRepository} from '../../adapters/data/repositories/credentialsRepository';
import {settingsRepository} from '../../adapters/data/repositories/settingsRepository';
import {createDebouncedSaver} from '../../adapters/data/persistence';

interface SettingsState {
  settings: Settings;
  apiKey: string;
  apiKeyError: string | null;
  savingApiKey: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  setApiKey: (apiKey: string) => Promise<void>;
  resetSettings: () => void;
}

const settingsSaver = createDebouncedSaver<Settings>(
  settings => settingsRepository.save(settings),
  PERSISTENCE_INTERVALS.settingsDebounceMs,
);

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: {...DEFAULT_SETTINGS},
  apiKey: '',
  apiKeyError: null,
  savingApiKey: false,
  hydrated: false,

  hydrate: async () => {
    const [settings, credentials] = await Promise.all([
      settingsRepository.load(),
      credentialsRepository.load().then(
        apiKey => ({apiKey, apiKeyError: null}),
        () => ({
          apiKeyError: '无法读取 API Key，请重新打开应用或重新保存。',
        }),
      ),
    ]);
    set({settings, ...credentials, hydrated: true});
  },

  updateSettings: patch => {
    const next = normalizeSettings({...get().settings, ...patch});
    set({settings: next});
    settingsSaver.schedule(next);
  },

  setApiKey: async apiKey => {
    const trimmed = apiKey.trim();
    const current = get();
    if (
      current.savingApiKey ||
      (trimmed === current.apiKey && !current.apiKeyError)
    ) {
      return;
    }
    set({savingApiKey: true, apiKeyError: null});
    try {
      await credentialsRepository.save(trimmed);
      set({apiKey: trimmed});
    } catch {
      set({
        apiKeyError: trimmed
          ? 'API Key 保存失败，请重试。'
          : 'API Key 清除失败，请重试。',
      });
    } finally {
      set({savingApiKey: false});
    }
  },

  resetSettings: () => {
    set({settings: {...DEFAULT_SETTINGS}});
    settingsSaver.schedule({...DEFAULT_SETTINGS});
  },
}));

export const flushSettings = (): Promise<void> => settingsSaver.flush();
