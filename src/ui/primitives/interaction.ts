import {Platform, type ViewStyle} from 'react-native';

/**
 * Web 端补充的交互样式。
 *
 * `react-native-web` 不会给 Pressable 自动加 `cursor: pointer`，桌面浏览器里
 * 可点击区域缺少指针反馈；这里集中处理，原生端返回 undefined。
 */
export const webPointer: ViewStyle | undefined =
  Platform.OS === 'web'
    ? ({
        cursor: 'pointer',
        // 避免桌面端长按选中文字，与原生触感保持一致。
        userSelect: 'none',
      } as unknown as ViewStyle)
    : undefined;
