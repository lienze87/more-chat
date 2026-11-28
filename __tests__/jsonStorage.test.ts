import AsyncStorage from '@react-native-async-storage/async-storage';
import {readJson, writeJson} from '../src/adapters/data/storage/jsonStorage';

describe('jsonStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('round-trips JSON values', async () => {
    await writeJson('test/key', {enabled: true, count: 2});

    await expect(readJson('test/key')).resolves.toEqual({
      enabled: true,
      count: 2,
    });
  });

  it('returns undefined for missing or invalid data', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem('test/invalid', '{not json');

    await expect(readJson('test/missing')).resolves.toBeUndefined();
    await expect(readJson('test/invalid')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[storage] failed to read test/invalid',
      expect.any(Error),
    );
  });

  it('swallows write failures after logging them', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('quota'));

    await expect(writeJson('test/key', 'value')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[storage] failed to write test/key',
      expect.any(Error),
    );
  });
});
