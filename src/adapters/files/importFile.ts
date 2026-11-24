import {getDocumentAsync} from 'expo-document-picker';
import {File} from 'expo-file-system';

const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export async function pickSkillFile() {
  const result = await getDocumentAsync({
    copyToCacheDirectory: true,
    base64: false,
  });
  if (result.canceled) {
    return;
  }
  const [asset] = result.assets;
  const file = asset.file ?? new File(asset.uri);
  try {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error('导入文件不能超过 4 MB。');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_IMPORT_BYTES) {
      throw new Error('导入文件不能超过 4 MB。');
    }
    return {name: asset.name, bytes};
  } finally {
    if (asset.file) {
      URL.revokeObjectURL(asset.uri);
    } else if (file instanceof File && file.exists) {
      try {
        file.delete();
      } catch {
        // 读取成功后，缓存清理失败无需影响导入。
      }
    }
  }
}
