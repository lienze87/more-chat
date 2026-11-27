import React from 'react';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ThemeColors} from '../theme/tokens';
import {AppText} from './AppText';
import {Icon, type IconName} from './Icon';
import {webPointer} from './interaction';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'dangerSoft';

export type ButtonSize = 'sm' | 'md';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  onTouchStart?: () => void;
}

/** 按钮只有 6 种语义变体 × 3 种尺寸，页面不再自己拼背景色和圆角。 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  onTouchStart,
}: ButtonProps) {
  const theme = useTheme();
  const {colors, radius: r, spacing: s, controlSize} = theme;
  const palette = buttonPalette(variant, colors);
  const labelVariant = size === 'sm' ? 'footnote' : 'body';
  const iconSize = size === 'sm' ? theme.iconSize.sm : theme.iconSize.md;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      onTouchStart={onTouchStart}
      style={({pressed}) => [
        styles.base,
        webPointer,
        {
          minHeight: controlSize.touch,
          minWidth: controlSize.touch,
          maxWidth: '100%',
          paddingVertical: s.sm,
          paddingHorizontal: size === 'sm' ? s.md : s.xl,
          borderRadius: r.md,
          backgroundColor: palette.background,
          borderWidth: palette.border ? StyleSheet.hairlineWidth : 0,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={iconSize} color={palette.foreground} />
      ) : null}
      <AppText
        variant={labelVariant}
        style={[styles.label, {color: palette.foreground}]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function buttonPalette(variant: ButtonVariant, colors: ThemeColors) {
  switch (variant) {
    case 'secondary':
      return {
        background: colors.surface,
        foreground: colors.text,
        border: colors.border,
      };
    case 'soft':
      return {
        background: colors.accentSoft,
        foreground: colors.accent,
        border: null,
      };
    case 'dangerSoft':
      return {
        background: colors.dangerSoft,
        foreground: colors.danger,
        border: null,
      };
    case 'primary':
    default:
      return {
        background: colors.accent,
        foreground: colors.onAccent,
        border: null,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: {
    flexShrink: 1,
    fontWeight: '600',
  },
});
