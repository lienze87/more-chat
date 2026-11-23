import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {credentialsRepository} from '../src/adapters/data/repositories/credentialsRepository';
import {credentialsRepository as webCredentials} from '../src/adapters/data/repositories/credentialsRepository.web';
import {STORAGE_KEYS} from '../src/config/appConfig';
import {useSettingsStore} from '../src/features/settings/settingsStore';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const legacyKey = STORAGE_KEYS.credentials;
const getSecureKey = jest.mocked(SecureStore.getItemAsync);
const setSecureKey = jest.mocked(SecureStore.setItemAsync);
const deleteSecureKey = jest.mocked(SecureStore.deleteItemAsync);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  getSecureKey.mockReset().mockResolvedValue(null);
  setSecureKey.mockReset().mockResolvedValue(undefined);
  deleteSecureKey.mockReset().mockResolvedValue(undefined);
  useSettingsStore.setState({
    apiKey: '',
    apiKeyError: null,
    savingApiKey: false,
  });
});

it('moves the native legacy key to SecureStore and removes the old copy', async () => {
  await AsyncStorage.setItem(legacyKey, JSON.stringify({apiKey: 'sk-legacy'}));

  await expect(credentialsRepository.load()).resolves.toBe('sk-legacy');
  expect(setSecureKey).toHaveBeenCalledWith(
    'morechat.credentials.v1',
    'sk-legacy',
    {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY},
  );
  expect(await AsyncStorage.getItem(legacyKey)).toBeNull();
});

it('keeps the legacy copy when SecureStore cannot write it', async () => {
  const legacy = JSON.stringify({apiKey: 'sk-legacy'});
  await AsyncStorage.setItem(legacyKey, legacy);
  setSecureKey.mockRejectedValueOnce(new Error('write failed'));

  await expect(credentialsRepository.load()).rejects.toThrow('write failed');
  expect(await AsyncStorage.getItem(legacyKey)).toBe(legacy);
});

it('prefers the secure key when an interrupted migration left both copies', async () => {
  await AsyncStorage.setItem(legacyKey, JSON.stringify({apiKey: 'sk-legacy'}));
  getSecureKey.mockResolvedValueOnce('sk-new');

  await expect(credentialsRepository.load()).resolves.toBe('sk-new');
  expect(setSecureKey).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(legacyKey)).toBeNull();
});

it('clears both native copies when saving an empty key', async () => {
  await AsyncStorage.setItem(legacyKey, JSON.stringify({apiKey: 'sk-legacy'}));

  await credentialsRepository.save('');

  expect(deleteSecureKey).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(legacyKey)).toBeNull();
});

it('deletes the previous browser key without passing it into application state', async () => {
  await AsyncStorage.setItem(legacyKey, JSON.stringify({apiKey: 'sk-legacy'}));

  await expect(webCredentials.load()).resolves.toBe('');
  await webCredentials.save();

  expect(await AsyncStorage.getItem(legacyKey)).toBeNull();
  expect(getSecureKey).not.toHaveBeenCalled();
  expect(setSecureKey).not.toHaveBeenCalled();
});

it('keeps the previous key available when the new key fails to save', async () => {
  useSettingsStore.setState({apiKey: 'sk-existing'});
  setSecureKey.mockRejectedValueOnce(new Error('write failed'));

  const pending = useSettingsStore.getState().setApiKey('sk-new');
  expect(useSettingsStore.getState()).toMatchObject({
    apiKey: 'sk-existing',
    savingApiKey: true,
  });
  await pending;

  expect(useSettingsStore.getState()).toMatchObject({
    apiKey: 'sk-existing',
    apiKeyError: 'API Key 保存失败，请重试。',
    savingApiKey: false,
  });
});
