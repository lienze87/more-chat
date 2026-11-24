import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from './AppText';
import {webPointer} from './interaction';

export interface ListRowProps {
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  accessibilityRole?: AccessibilityProps['accessibilityRole'];
  accessibilityState?: AccessibilityProps['accessibilityState'];
}

/** 设置页的通用行：左侧文字（含说明），右侧控件。 */
export function ListRow({
  label,
  description,
  right,
  onPress,
  destructive = false,
  accessibilityRole = 'button',
  accessibilityState,
}: ListRowProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;

  const content = (
    <>
      <View style={styles.textColumn}>
        <AppText
          variant="body"
          style={{color: destructive ? colors.danger : colors.text}}
        >
          {label}
        </AppText>
        {description ? (
          <AppText variant="footnote" tone="tertiary">
            {description}
          </AppText>
        ) : null}
      </View>
      {right}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, {paddingVertical: spacing.md}]}>{content}</View>
    );
  }

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      aria-checked={accessibilityState?.checked}
      disabled={accessibilityState?.disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.row,
        webPointer,
        {
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
});
