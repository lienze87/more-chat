import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {STORAGE_KEYS} from '../../../config/appConfig';

const key = 'morechat.credentials.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const credentialsRepository = {
  async load(): Promise<string> {
    const secureKey = await SecureStore.getItemAsync(key, options);
    const legacy = await AsyncStorage.getItem(STORAGE_KEYS.credentials);
    if (legacy === null) {
      return secureKey ?? '';
    }
    if (secureKey !== null) {
      await AsyncStorage.removeItem(STORAGE_KEYS.credentials);
      return secureKey;
    }

    const stored = JSON.parse(legacy) as {apiKey?: unknown} | null;
    const apiKey =
      typeof stored?.apiKey === 'string' ? stored.apiKey.trim() : '';
    if (apiKey) {
      await SecureStore.setItemAsync(key, apiKey, options);
    }
    await AsyncStorage.removeItem(STORAGE_KEYS.credentials);
    return apiKey;
  },

  async save(apiKey: string): Promise<void> {
    if (apiKey) {
      await SecureStore.setItemAsync(key, apiKey, options);
      return;
    }

    // 先清除旧值，避免安全存储清空后下次启动又迁回旧凭据。
    await AsyncStorage.removeItem(STORAGE_KEYS.credentials);
    await SecureStore.deleteItemAsync(key, options);
  },
};
