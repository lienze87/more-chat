import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../../../config/appConfig';

const removeLegacyKey = () => AsyncStorage.removeItem(STORAGE_KEYS.credentials);

export const credentialsRepository = {
  async load(): Promise<string> {
    await removeLegacyKey();
    return '';
  },

  // Web 端只由 settingsStore 在内存中持有当前页面使用的 Key。
  save: removeLegacyKey,
};
