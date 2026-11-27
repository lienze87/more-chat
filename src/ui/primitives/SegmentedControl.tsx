import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from './AppText';
import {webPointer} from './interaction';

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** 分段控件：设置页的推理强度、语言、主题共用。 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const {colors, radius, spacing, controlSize} = theme;

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          padding: spacing.xxs,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{selected, disabled}}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({pressed}) => [
              styles.segment,
              webPointer,
              {
                borderRadius: radius.sm,
                backgroundColor: selected ? colors.surface : 'transparent',
                borderWidth: selected ? StyleSheet.hairlineWidth : 0,
                borderColor: colors.border,
                minHeight: controlSize.touch,
                minWidth: controlSize.touch,
                paddingVertical: spacing.sm,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <AppText
              variant="label"
              align="center"
              style={{
                color: selected ? colors.text : colors.textSecondary,
                fontWeight: selected ? '600' : '500',
              }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
