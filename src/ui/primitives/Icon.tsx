import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {StyleSheet, type StyleProp, type TextStyle} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ThemeColors} from '../theme/tokens';

/**
 * 图标库：`@expo/vector-icons`（Ionicons）。
 *
 * 通过语义化的 `IconName` 收敛业务用到的图标，页面不直接依赖具体图标库；
 * 以后换图标集只需改这一处映射。颜色默认跟随主题文本层级。
 */
export const ICONS = {
  back: 'chevron-back',
  menu: 'menu',
  more: 'ellipsis-horizontal',
  close: 'close',
  plus: 'add',
  settings: 'settings-outline',
  folder: 'folder-outline',
  download: 'download-outline',
  extensions: 'extension-puzzle-outline',
  trash: 'trash-outline',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  chevronRight: 'chevron-forward',
  globe: 'globe-outline',
  spark: 'sparkles',
  refresh: 'refresh',
  share: 'share-outline',
  key: 'key-outline',
  alert: 'alert-circle-outline',
  tool: 'construct-outline',
  copy: 'copy-outline',
  checkmark: 'checkmark',
  checkmarkCircle: 'checkmark-circle-outline',
  document: 'document-text-outline',
  question: 'help-circle-outline',
  timer: 'timer-outline',
} as const;

export type IconName = keyof typeof ICONS;

export type IconTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'danger';

export function iconTonColor(colors: ThemeColors, tone: IconTone): string {
  switch (tone) {
    case 'primary':
      return colors.text;
    case 'accent':
      return colors.accent;
    case 'danger':
      return colors.danger;
    case 'tertiary':
      return colors.textTertiary;
    case 'secondary':
    default:
      return colors.textSecondary;
  }
}

export interface IconProps {
  name: IconName;
  size?: number;
  tone?: IconTone;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({
  name,
  size,
  tone = 'secondary',
  color,
  style,
}: IconProps) {
  const theme = useTheme();
  return (
    <Ionicons
      name={ICONS[name]}
      size={size ?? theme.iconSize.lg}
      color={color ?? iconTonColor(theme.colors, tone)}
      style={[styles.icon, style]}
      // 图标是装饰性元素，语义由外层按钮的 accessibilityLabel 提供。
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    textAlignVertical: 'center',
  },
});
