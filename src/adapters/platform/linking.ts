import {Linking} from 'react-native';

/** 打开外部链接；浏览器/系统拒绝时静默失败，由界面继续可用。 */
export function openExternalUrl(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}
