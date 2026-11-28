import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {ServerToolCall, ToolSource} from '../../domain/chat/types';
import {openExternalUrl} from '../../adapters/platform/linking';
import {hostOf} from '../../utils/url';
import {presentServerToolCall} from './serverToolPresentation';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';

interface ToolCallCardProps {
  call: ServerToolCall;
}

function siteLabel(source: ToolSource): string {
  return source.site_name || hostOf(source.url);
}

/** 服务端工具步骤：搜索 / 打开网页 / 阅读链接，附带来源列表。 */
export function ToolCallCard({call}: ToolCallCardProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const {title, detail} = presentServerToolCall(call);
  const sources = call.sources?.slice(0, 4) ?? [];
  const failed = call.status === 'failed';
  const pending = !call.status || call.status === 'running';

  return (
    <Card
      variant="muted"
      style={[
        styles.container,
        {paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
      ]}
    >
      <View style={styles.header}>
        <Icon name="globe" size={theme.iconSize.sm} tone="accent" />
        <AppText variant="label" numberOfLines={2} style={styles.title}>
          {title}
        </AppText>
        <AppText variant="caption" tone={failed ? 'danger' : 'tertiary'}>
          {failed ? '失败' : pending ? '进行中' : '已完成'}
        </AppText>
      </View>
      {detail ? (
        <AppText
          variant="caption"
          tone="secondary"
          numberOfLines={2}
          style={styles.detail}
        >
          {detail}
        </AppText>
      ) : null}
      {sources.length > 0 ? (
        <View
          style={[
            styles.sources,
            {
              borderTopColor: colors.border,
              gap: spacing.xs,
              paddingTop: spacing.sm,
              marginTop: spacing.sm,
            },
          ]}
        >
          {sources.map(source => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              accessibilityLabel={source.title || source.url}
              onPress={() => openExternalUrl(source.url)}
              style={({pressed}) => [
                styles.sourceRow,
                webPointer,
                {
                  minHeight: theme.controlSize.touch,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <View
                style={[styles.sourceDot, {backgroundColor: colors.accent}]}
              />
              <AppText
                variant="caption"
                tone="secondary"
                numberOfLines={2}
                style={styles.sourceTitle}
              >
                {source.title || source.url}
              </AppText>
              <AppText
                variant="caption"
                tone="tertiary"
                numberOfLines={1}
                style={styles.sourceSite}
              >
                {siteLabel(source)}
              </AppText>
            </Pressable>
          ))}
        </View>
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
  detail: {
    marginTop: 4,
  },
  sources: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sourceTitle: {
    flex: 1,
  },
  sourceSite: {
    maxWidth: 90,
  },
});
