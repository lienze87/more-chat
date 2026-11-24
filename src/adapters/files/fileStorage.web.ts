import {createStore, del, get, keys, set} from 'idb-keyval';

const storage = createStore('morechat-files', 'files');

export const fileStorage = {
  keys: () => keys<string>(storage),
  read: (key: string) => get<string>(key, storage),
  write: (key: string, text: string) => set(key, text, storage),
  remove: (key: string) => del(key, storage),
};
