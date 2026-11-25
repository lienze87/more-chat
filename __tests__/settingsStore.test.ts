import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../src/config/appConfig';
import {useSettingsStore} from '../src/features/settings/settingsStore';

it('persists the latest text settings 300 ms after the last edit', async () => {
  jest.useFakeTimers();
  try {
    await AsyncStorage.clear();
    const {updateSettings} = useSettingsStore.getState();
    updateSettings({location: '上'});
    await jest.advanceTimersByTimeAsync(200);
    updateSettings({location: '上海', systemPrompt: '先给结论'});

    expect(useSettingsStore.getState().settings).toMatchObject({
      location: '上海',
      systemPrompt: '先给结论',
    });
    await jest.advanceTimersByTimeAsync(299);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.settings)).toBeNull();

    await jest.advanceTimersByTimeAsync(1);
    const persisted = await AsyncStorage.getItem(STORAGE_KEYS.settings);
    expect(JSON.parse(persisted ?? 'null')).toMatchObject({
      location: '上海',
      systemPrompt: '先给结论',
    });
  } finally {
    jest.useRealTimers();
  }
});
