import * as SecureStore from 'expo-secure-store';
import {credentialsRepository} from '../src/adapters/data/repositories/credentialsRepository';
import {credentialsRepository as webCredentials} from '../src/adapters/data/repositories/credentialsRepository.web';
import {useSettingsStore} from '../src/features/settings/settingsStore';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getSecureKey = jest.mocked(SecureStore.getItemAsync);
const setSecureKey = jest.mocked(SecureStore.setItemAsync);
const deleteSecureKey = jest.mocked(SecureStore.deleteItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  getSecureKey.mockReset().mockResolvedValue(null);
  setSecureKey.mockReset().mockResolvedValue(undefined);
  deleteSecureKey.mockReset().mockResolvedValue(undefined);
  useSettingsStore.setState({
    apiKey: '',
    apiKeyError: null,
    savingApiKey: false,
  });
});

it('reads, saves and clears native credentials in SecureStore', async () => {
  await expect(credentialsRepository.load()).resolves.toBe('');
  getSecureKey.mockResolvedValueOnce('sk-current');
  await expect(credentialsRepository.load()).resolves.toBe('sk-current');

  const key = 'morechat.credentials.v1';
  const options = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  await credentialsRepository.save('sk-new');
  expect(setSecureKey).toHaveBeenCalledWith(key, 'sk-new', options);
  await credentialsRepository.save('');
  expect(deleteSecureKey).toHaveBeenCalledWith(key, options);
});

it('keeps browser credentials in page memory', async () => {
  await expect(webCredentials.load()).resolves.toBe('');
  await webCredentials.save('sk-browser');
  await expect(webCredentials.load()).resolves.toBe('sk-browser');
  await webCredentials.save('');
  await expect(webCredentials.load()).resolves.toBe('');
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
