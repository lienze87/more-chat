import {Directory, File, Paths} from 'expo-file-system';
import {fromByteArray, toByteArray} from 'base64-js';
import {strFromU8, strToU8} from 'fflate';

const directory = () => new Directory(Paths.document, 'morechat-files');
const fileFor = (key: string) =>
  new File(
    directory(),
    fromByteArray(strToU8(key)).replace(/\+/g, '-').replace(/\//g, '_'),
  );

export const fileStorage = {
  async keys(): Promise<string[]> {
    const root = directory();
    if (!root.exists) {
      return [];
    }
    return root
      .list()
      .flatMap(item =>
        item instanceof File && !item.name.endsWith('.pending')
          ? [
              strFromU8(
                toByteArray(item.name.replace(/-/g, '+').replace(/_/g, '/')),
              ),
            ]
          : [],
      );
  },

  async read(key: string): Promise<string | undefined> {
    const file = fileFor(key);
    return file.exists ? file.text() : undefined;
  },

  async write(key: string, text: string): Promise<void> {
    directory().create({idempotent: true, intermediates: true});
    const file = fileFor(key);
    const pendingName = `${file.name}.pending`;
    const pending = new File(directory(), pendingName);
    try {
      await pending.write(text);
      await pending.move(file, {overwrite: true});
    } catch (error) {
      const temporary = new File(directory(), pendingName);
      if (temporary.exists) {
        temporary.delete();
      }
      throw error;
    }
  },

  async remove(key: string): Promise<void> {
    const file = fileFor(key);
    if (file.exists) {
      file.delete();
    }
  },
};
