import * as SecureStore from 'expo-secure-store';

const key = 'morechat.credentials.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const credentialsRepository = {
  async load(): Promise<string> {
    return (await SecureStore.getItemAsync(key, options)) ?? '';
  },

  async save(apiKey: string): Promise<void> {
    if (apiKey) {
      await SecureStore.setItemAsync(key, apiKey, options);
    } else {
      await SecureStore.deleteItemAsync(key, options);
    }
  },
};
