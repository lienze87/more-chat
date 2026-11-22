import {Clipboard, Platform} from 'react-native';

/**
 * 复制纯文本。
 *
 * Web 走 navigator.clipboard（需要用户手势，按钮点击满足）；原生用 react-native
 * 内置的 Clipboard——它已被标记废弃，但仍是当前依赖集里唯一可用的实现。等允许
 * 新增依赖时换成 expo-clipboard，只需要改这一个文件。
 */
export async function copyText(text: string): Promise<void> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return;
    }
  }
  Clipboard.setString(text);
}
