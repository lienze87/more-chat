import React from 'react';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {Icon, type IconName, type IconTone} from './Icon';
import {webPointer} from './interaction';

export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps {
  name: IconName;
  onPress: () => void;
  /** 必填：图标对读屏软件不可见，语义只能来自这里。 */
  accessibilityLabel: string;
  size?: IconButtonSize;
  /** 自定义图标尺寸，用于让图标与相邻文字的字号对齐。 */
  iconSize?: number;
  tone?: IconTone;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 图标按钮：图标尺寸独立于触控区域。 */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 'md',
  iconSize,
  tone = 'secondary',
  disabled = false,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const {radius, controlSize} = theme;
  const glyphSize =
    iconSize ?? (size === 'sm' ? theme.iconSize.sm : theme.iconSize.md);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        webPointer,
        {
          width: controlSize.touch,
          height: controlSize.touch,
          borderRadius: radius.md,
          backgroundColor: 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Icon name={name} size={glyphSize} tone={tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
