import React from 'react';
import {Linking, Pressable, StyleSheet, View} from 'react-native';
import type {ServerToolCall, ToolSource} from '../../domain/chat/types';
import {hostOf} from '../../utils/url';
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

function describeCall(call: ServerToolCall): {title: string; detail?: string} {
  const action = (call.action ?? {}) as Record<string, unknown>;
  const actionType = typeof action.type === 'string' ? action.type : 'unknown';
  const url = typeof action.url === 'string' ? action.url : undefined;

  switch (actionType) {
    case 'search': {
      const queries = Array.isArray(action.queries)
        ? action.queries.filter(
            (query): query is string => typeof query === 'string',
          )
        : [];
      return {
        title:
          call.kind === 'image_search' || call.kind === 'deep_image_search'
            ? '搜索图片'
            : '联网搜索',
        detail: queries.length > 0 ? queries.join(' · ') : undefined,
      };
    }
    case 'open_page':
      return {
        title: call.page?.title || '打开网页',
        detail: hostOf(url),
      };
    case 'find_in_page': {
      const pattern =
        typeof action.pattern === 'string' ? action.pattern : undefined;
      return {
        title: '在网页中查找',
        detail: pattern ? `“${pattern}”` : undefined,
      };
    }
    case 'read_link':
      return {
        title: call.page?.title || '阅读链接',
        detail: hostOf(url),
      };
    default:
      return {title: '网页工具', detail: undefined};
  }
}

/** 服务端工具步骤：搜索 / 打开网页 / 阅读链接，附带来源列表。 */
export function ToolCallCard({call}: ToolCallCardProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const {title, detail} = describeCall(call);
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
              onPress={() => Linking.openURL(source.url).catch(() => undefined)}
              style={({pressed}) => [
                styles.sourceRow,
                webPointer,
                {opacity: pressed ? 0.6 : 1},
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
