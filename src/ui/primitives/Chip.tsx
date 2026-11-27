import React from 'react';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from './AppText';
import {webPointer} from './interaction';

export interface ChipProps {
  label: string;
  onPress: () => void;
  active?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

/** 胶囊标签：设置页的模型预设、可选项共用。 */
export function Chip({
  label,
  onPress,
  active = false,
  size = 'md',
  style,
}: ChipProps) {
  const theme = useTheme();
  const {colors, radius, spacing, controlSize} = theme;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        webPointer,
        {
          minHeight: controlSize.touch,
          minWidth: controlSize.touch,
          maxWidth: '100%',
          paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.accentSoft : 'transparent',
          borderColor: active ? colors.accent : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <AppText
        variant="footnote"
        style={{
          flexShrink: 1,
          color: active ? colors.accent : colors.textSecondary,
          fontWeight: '500',
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
  },
});
