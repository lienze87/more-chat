import React, {useState} from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from './AppText';
import {webPointer} from './interaction';

export interface TextFieldProps {
  label?: string;
  description?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoFocus?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  submitOnReturn?: boolean;
  selection?: TextInputProps['selection'];
  onSelectionChange?: TextInputProps['onSelectionChange'];
  /** 右侧附加控件，例如“显示 / 隐藏”切换。 */
  accessory?: React.ReactNode;
  accessibilityLabel?: string;
}

/** 统一输入框：聚焦态高亮、圆角、内边距全部来自令牌。 */
export function TextField({
  label,
  description,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  editable,
  multiline,
  keyboardType,
  autoCapitalize = 'none',
  autoFocus,
  maxLength,
  onFocus,
  onBlur,
  onSubmitEditing,
  submitOnReturn,
  selection,
  onSelectionChange,
  accessory,
  accessibilityLabel,
}: TextFieldProps) {
  const theme = useTheme();
  const {colors, radius, spacing} = theme;
  const [focused, setFocused] = useState(false);

  return (
    <View style={{gap: spacing.sm}}>
      {label || accessory ? (
        <View style={styles.labelRow}>
          {label ? (
            <AppText variant="label" style={styles.label}>
              {label}
            </AppText>
          ) : null}
          {accessory}
        </View>
      ) : null}

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={submitOnReturn ? 'done' : undefined}
        submitBehavior={submitOnReturn ? 'blurAndSubmit' : undefined}
        blurOnSubmit={
          submitOnReturn && Platform.OS === 'web' ? true : undefined
        }
        selection={selection}
        onSelectionChange={onSelectionChange}
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          webPointer,
          {
            color: colors.text,
            backgroundColor: focused ? colors.surface : colors.surfaceMuted,
            borderColor: focused ? colors.accent : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            minHeight: multiline ? 104 : 46,
          },
        ]}
      />

      {description ? (
        <AppText variant="footnote" tone="tertiary">
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    flex: 1,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    lineHeight: 21,
  },
});
