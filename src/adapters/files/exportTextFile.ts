import {Platform} from 'react-native';
import {Directory, File, Paths} from 'expo-file-system';
import {isAvailableAsync, shareAsync} from 'expo-sharing';
import {FILE_EXPORT_TIMING} from '../../config/appConfig';
import {createId} from '../platform/ids';

export async function exportTextFile(
  name: string,
  content: string,
): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new Error('当前设备无法打开系统分享。');
  }

  const root = new Directory(Paths.cache, 'morechat-exports');
  root.create({idempotent: true, intermediates: true});
  // 分享目标可能在系统面板关闭后才读取文件，缓存副本留到下次清理。
  try {
    const cutoff = Date.now() - FILE_EXPORT_TIMING.nativeCacheRetentionMs;
    for (const entry of root.list()) {
      if (
        entry instanceof Directory &&
        (entry.info().modificationTime ?? Infinity) < cutoff
      ) {
        entry.delete();
      }
    }
  } catch {
    // 缓存清理失败时仍可继续分享。
  }

  const directory = new Directory(root, createId('share'));
  directory.create();
  const file = new File(directory, name);
  await file.write(content);
  await shareAsync(file.uri, {
    dialogTitle: '分享文件',
    mimeType: Platform.OS === 'android' ? 'text/plain' : undefined,
  });
}
