import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {Icon} from '../primitives/Icon';
import {Logo} from './Logo';

const SUGGESTIONS = [
  '用三句话介绍 DeepSeek API 能做什么',
  '帮我制定一份一周的健身计划',
  '对比 React Native 和 Flutter 的优缺点',
];

/** 新会话欢迎页：品牌标识 + 一句话介绍 + 可点击的示例问题。 */
export function ChatWelcome({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  const theme = useTheme();
  const {spacing} = theme;

  return (
    <View style={[styles.welcome, {gap: spacing.md}]}>
      <Logo size={56} />
      <View style={[styles.heading, {gap: spacing.xs}]}>
        <AppText variant="headline" align="center">
          你好，我是 MoreChat
        </AppText>
        <AppText
          variant="body"
          tone="secondary"
          align="center"
          style={styles.subtitle}
        >
          基于 DeepSeek API 的移动对话助手，支持深度思考、联网搜索与链接阅读。
        </AppText>
      </View>

      <View style={[styles.suggestions, {gap: spacing.sm}]}>
        {SUGGESTIONS.map(suggestion => (
          <Card
            key={suggestion}
            onPress={() => onSuggestion(suggestion)}
            accessibilityLabel={suggestion}
            variant="surface"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            <AppText
              variant="body"
              tone="secondary"
              style={styles.suggestionText}
            >
              {suggestion}
            </AppText>
            <Icon
              name="chevronRight"
              size={theme.iconSize.sm}
              tone="tertiary"
            />
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: {
    paddingTop: 32,
    paddingBottom: 16,
    alignItems: 'center',
  },
  heading: {
    alignItems: 'center',
  },
  subtitle: {
    maxWidth: 320,
  },
  suggestions: {
    width: '100%',
    marginTop: 8,
  },
  suggestionText: {
    flex: 1,
  },
});
