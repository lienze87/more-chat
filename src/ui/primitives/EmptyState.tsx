import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from './AppText';
import {Button} from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** 自定义插画（例如品牌 Logo）。 */
  artwork?: React.ReactNode;
  action?: {label: string; onPress: () => void};
}

/** 空状态：会话列表为空、对话尚未开始等场景共用。 */
export function EmptyState({
  title,
  description,
  artwork,
  action,
}: EmptyStateProps) {
  const theme = useTheme();
  const {spacing} = theme;

  return (
    <View
      style={[
        styles.container,
        {paddingVertical: spacing.huge, gap: spacing.sm},
      ]}
    >
      {artwork}
      <AppText variant="title" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText
          variant="body"
          tone="secondary"
          align="center"
          style={styles.description}
        >
          {description}
        </AppText>
      ) : null}
      {action ? (
        <View style={{marginTop: spacing.md}}>
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="soft"
            size="sm"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  description: {
    maxWidth: 320,
  },
});
