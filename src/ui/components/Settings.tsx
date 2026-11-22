import React from 'react';
import {
  StyleSheet,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {Divider as PrimitiveDivider} from '../primitives/Divider';
import {Icon} from '../primitives/Icon';
import {ListRow} from '../primitives/ListRow';
import {TextField} from '../primitives/TextField';
import {Toggle} from '../primitives/Toggle';
import {useSyncedDraft} from '../hooks/useSyncedDraft';

/** 设置分组：小标题 + 卡片 + 说明文字。 */
export function Section({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const {spacing} = theme;
  return (
    <View style={[{gap: spacing.sm}, style]}>
      {title ? (
        <AppText
          variant="overline"
          tone="tertiary"
          style={{marginLeft: spacing.xs}}
        >
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <Card padding="none">{children}</Card>
      {footer ? (
        <AppText
          variant="footnote"
          tone="tertiary"
          style={{marginHorizontal: spacing.xs}}
        >
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

/** 卡片内分割线，左侧留出行内文字的缩进。 */
export function Divider() {
  return <PrimitiveDivider inset={16} />;
}

export function SettingRow({
  label,
  description,
  right,
  onPress,
  destructive,
}: {
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <ListRow
      label={label}
      description={description}
      right={right}
      onPress={onPress}
      destructive={destructive}
    />
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <ListRow
      label={label}
      description={description}
      accessibilityRole="switch"
      accessibilityState={{checked: value}}
      onPress={() => onValueChange(!value)}
      right={<Toggle value={value} />}
    />
  );
}

export function ActionRow({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <SettingRow
      label={label}
      onPress={onPress}
      destructive={destructive}
      right={
        <Icon name="chevronRight" size={theme.iconSize.md} tone="tertiary" />
      }
    />
  );
}

/** 分段控件直接复用基础组件，避免两套实现。 */
export {SegmentedControl} from '../primitives/SegmentedControl';

/**
 * 带草稿的文本设置项：失焦或回车时提交，避免每敲一个字符就写一次存储。
 */
export function SettingsTextField({
  label,
  description,
  value,
  onCommit,
  multiline,
  keyboardType,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useSyncedDraft(value);

  return (
    <View
      style={[styles.field, {padding: theme.spacing.lg, gap: theme.spacing.sm}]}
    >
      <TextField
        label={label}
        description={description}
        value={draft}
        onChangeText={setDraft}
        onBlur={() => onCommit(draft)}
        onSubmitEditing={() => onCommit(draft)}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholder={placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 52,
  },
});
