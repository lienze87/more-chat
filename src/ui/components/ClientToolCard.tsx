import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';
import type {ClientToolCall} from '../../domain/chat/types';
import {
  parseToolArguments,
  summarizeParsedArguments,
} from '../../domain/chat/toolCall';
import {pathFromToolArguments} from '../../features/extensions/filePaths';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';

/**
 * 客户端工具（function calling）的调用卡片。
 *
 * 通用渲染：工具名 + 参数摘要 + 结果；文件工具额外给出可点击的路径。
 */
export function ClientToolCard({
  call,
  onOpenFile,
}: {
  call: ClientToolCall;
  onOpenFile?: (path: string) => void;
}) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const parsed = parseToolArguments(call);
  const args = parsed
    ? summarizeParsedArguments(parsed)
    : call.argumentsText.trim();
  const failed = call.status === 'failed';
  const running = call.status === 'running';
  const output = failed ? call.error : call.result;
  const path = parsed ? pathFromToolArguments(parsed) : null;

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
      {path && onOpenFile ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`打开文件 ${path}`}
          onPress={() => onOpenFile(path)}
          style={({pressed}) => [
            styles.pathRow,
            webPointer,
            {
              minHeight: theme.controlSize.touch,
              gap: spacing.xs,
              opacity: pressed ? 0.65 : 1,
            },
          ]}
        >
          <Icon name="document" size={theme.iconSize.sm} tone="accent" />
          <AppText
            variant="footnote"
            tone="accent"
            numberOfLines={1}
            style={styles.pathText}
          >
            {path}
          </AppText>
          <Icon name="chevronRight" size={theme.iconSize.sm} tone="tertiary" />
        </Pressable>
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
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pathText: {
    flex: 1,
  },
});
