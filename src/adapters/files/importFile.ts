import {getDocumentAsync} from 'expo-document-picker';
import {File} from 'expo-file-system';
import {SKILL_LIMITS} from '../../config/appConfig';

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
  const maxImportMb = SKILL_LIMITS.maxImportBytes / (1024 * 1024);
  try {
    if (file.size > SKILL_LIMITS.maxImportBytes) {
      throw new Error(`导入文件不能超过 ${maxImportMb} MB。`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > SKILL_LIMITS.maxImportBytes) {
      throw new Error(`导入文件不能超过 ${maxImportMb} MB。`);
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
