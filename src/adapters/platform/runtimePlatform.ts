import {Platform} from 'react-native';
import type {RuntimePlatform} from '../../domain/chat/userMetadata';

/** React Native 的平台标识映射为 `<env_info>` 使用的三种运行形态。 */
export function currentPlatform(): RuntimePlatform {
  if (Platform.OS === 'web') {
    return 'web';
  }
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  return 'android';
}
