import {create} from 'zustand';
import {DEFAULT_SETTINGS, type Settings} from '../../domain/settings/types';
import {normalizeSettings} from '../../domain/settings/normalize';
import {
  credentialsRepository,
  settingsRepository,
} from '../../adapters/data/repositories/settingsRepository';
import {createThrottledSaver} from '../../adapters/data/persistence';

interface SettingsState {
  settings: Settings;
  apiKey: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  setApiKey: (apiKey: string) => void;
  resetSettings: () => void;
}

const settingsSaver = createThrottledSaver<Settings>(
  settings => settingsRepository.save(settings),
  600,
);

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: {...DEFAULT_SETTINGS},
  apiKey: '',
  hydrated: false,

  hydrate: async () => {
    const [settings, credentials] = await Promise.all([
      settingsRepository.load(),
      credentialsRepository.load(),
    ]);
    set({settings, apiKey: credentials.apiKey, hydrated: true});
  },

  updateSettings: patch => {
    const next = normalizeSettings({...get().settings, ...patch});
    set({settings: next});
    settingsSaver.schedule(next);
  },

  setApiKey: apiKey => {
    const trimmed = apiKey.trim();
    set({apiKey: trimmed});
    credentialsRepository.save({apiKey: trimmed}).catch(() => undefined);
  },

  resetSettings: () => {
    set({settings: {...DEFAULT_SETTINGS}});
    settingsSaver.schedule({...DEFAULT_SETTINGS});
  },
}));

export const flushSettings = (): Promise<void> => settingsSaver.flush();
