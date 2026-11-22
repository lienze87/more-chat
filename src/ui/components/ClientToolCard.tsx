import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import type {ClientToolCall} from '../../domain/chat/types';
import {summarizeToolArguments} from '../../domain/chat/toolCall';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {Icon} from '../primitives/Icon';

/**
 * 客户端工具（function calling）的调用卡片。
 *
 * 通用渲染：工具名 + 参数摘要 + 结果，够用即可。等真的接入具体工具后，
 * 再按工具名注册专属渲染器，这里作为兜底。
 */
export function ClientToolCard({call}: {call: ClientToolCall}) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const args = summarizeToolArguments(call);
  const failed = call.status === 'failed';
  const running = call.status === 'running';
  const output = failed ? call.error : call.result;

  return (
    <Card
      variant="muted"
      style={[
        styles.container,
        {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.xs,
        },
      ]}
    >
      <View style={styles.header}>
        <Icon name="tool" size={theme.iconSize.sm} tone="accent" />
        <AppText variant="label" numberOfLines={1} style={styles.title}>
          {call.name || '工具调用'}
        </AppText>
        {running ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <AppText variant="caption" tone={failed ? 'danger' : 'tertiary'}>
            {failed ? '失败' : '已完成'}
          </AppText>
        )}
      </View>
      {args ? (
        <AppText variant="caption" tone="secondary" numberOfLines={2}>
          {args}
        </AppText>
      ) : null}
      {output ? (
        <AppText
          variant="caption"
          tone={failed ? 'danger' : 'tertiary'}
          numberOfLines={4}
        >
          {output}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
  },
});
