import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ThemeColors} from '../theme/tokens';
import {webPointer} from './interaction';

export type CardVariant = 'surface' | 'muted' | 'accent' | 'danger';
export type CardPadding = 'none' | 'md';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** 统一容器：消息卡片、设置分组、工具步骤、可点击列表项都基于它。 */
export function Card({
  children,
  variant = 'surface',
  padding = 'md',
  onPress,
  accessibilityLabel,
  style,
}: CardProps) {
  const theme = useTheme();
  const {colors, radius, spacing} = theme;
  const palette = cardPalette(variant, colors);
  const pad = padding === 'none' ? 0 : spacing.md;

  const base = {
    backgroundColor: palette.background,
    borderRadius: radius.lg,
    borderWidth: palette.border ? StyleSheet.hairlineWidth : 0,
    borderColor: palette.border ?? 'transparent',
    padding: pad,
  };

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({pressed}) => [
        base,
        webPointer,
        {opacity: pressed ? 0.85 : 1},
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

function cardPalette(variant: CardVariant, colors: ThemeColors) {
  switch (variant) {
    case 'muted':
      return {background: colors.surfaceMuted, border: colors.border};
    case 'accent':
      return {background: colors.accentSoft, border: colors.accentBorder};
    case 'danger':
      return {background: colors.dangerSoft, border: colors.danger};
    case 'surface':
    default:
      return {background: colors.surface, border: colors.border};
  }
}
