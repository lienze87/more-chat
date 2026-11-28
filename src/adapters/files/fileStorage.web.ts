import {strToU8} from 'fflate';
import {createStore, del, get, keys, set} from 'idb-keyval';

const storage = createStore('morechat-files', 'files');

export const fileStorage = {
  keys: () => keys<string>(storage),
  read: (key: string) => get<string>(key, storage),
  write: (key: string, text: string) => set(key, text, storage),
  remove: (key: string) => del(key, storage),

  async rename(from: string, to: string, overwrite: boolean): Promise<void> {
    const content = await get<string>(from, storage);
    if (content === undefined) {
      throw new Error(`文件不存在：${from}`);
    }
    if (!overwrite && (await get(to, storage)) !== undefined) {
      throw new Error(`文件已存在：${to}`);
    }
    await set(to, content, storage);
    await del(from, storage);
  },

  async stat(key: string): Promise<{size: number; mtime?: number} | undefined> {
    const content = await get<string>(key, storage);
    // IndexedDB 不保存文件修改时间；Web 调试环境只返回字节数。
    return content === undefined ? undefined : {size: strToU8(content).length};
  },
};
