import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 读取任意 JSON 值。
 *
 * 解析结果保持 `unknown`：持久化结构由各仓储自己校验，避免在这里用一个泛型
 * 把未验证的数据伪装成具体类型。
 */
export async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    const value: unknown = JSON.parse(raw);
    return value;
  } catch (error) {
    console.warn(`[storage] failed to read ${key}`, error);
    return undefined;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] failed to write ${key}`, error);
  }
}
