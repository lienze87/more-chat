import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {Conversation} from '../../domain/chat/types';
import {formatRelativeTime, stripMarkdown} from '../../utils/text';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {webPointer} from '../primitives/interaction';

interface ConversationRowProps {
  conversation: Conversation;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function previewOf(conversation: Conversation): string {
  const last = conversation.messages[conversation.messages.length - 1];
  if (!last) {
    return '开始一段新的对话';
  }
  if (last.role === 'user') {
    return stripMarkdown(last.content);
  }
  if (last.status === 'streaming') {
    return '正在生成回答…';
  }
  const content = stripMarkdown(last.content);
  return content || '（无文字内容）';
}

/** 抽屉里的对话行：标题 + 相对时间 + 一行摘要，长按打开操作菜单。 */
export function ConversationRow({
  conversation,
  active,
  onPress,
  onLongPress,
}: ConversationRowProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`对话：${conversation.title}`}
      accessibilityState={{selected: active}}
      delayLongPress={350}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({pressed}) => [
        styles.row,
        webPointer,
        {
          backgroundColor: active
            ? colors.accentSoft
            : pressed
              ? colors.surfaceMuted
              : 'transparent',
          borderRadius: theme.radius.md,
          marginHorizontal: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.xxs,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <AppText
          variant="label"
          numberOfLines={1}
          style={[styles.title, active ? {color: colors.accent} : null]}
        >
          {conversation.title}
        </AppText>
        <AppText variant="caption" tone="tertiary">
          {formatRelativeTime(conversation.updatedAt)}
        </AppText>
      </View>
      <AppText variant="caption" tone="tertiary" numberOfLines={1}>
        {previewOf(conversation)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
  },
});
