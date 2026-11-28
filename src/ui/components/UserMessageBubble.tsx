import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppText} from '../primitives/AppText';
import {useTheme} from '../theme/ThemeProvider';

/** 用户消息气泡：靠右、圆角与主题色来自设计令牌。 */
export function UserMessageBubble({content}: {content: string}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, {marginBottom: theme.spacing.lg}]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.colors.userBubble,
            borderRadius: theme.radius.lg,
            borderBottomRightRadius: theme.radius.xs,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
          },
        ]}
      >
        <AppText tone="userBubble">{content}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '86%',
  },
});
