import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Logo} from './Logo';

/** 新会话欢迎页：品牌标识与固定的输入提示。 */
export function ChatWelcome() {
  const theme = useTheme();
  const {spacing} = theme;

  return (
    <View style={styles.welcome}>
      <Logo size={32} />

      <View style={[styles.prompt, {gap: spacing.sm, marginTop: spacing.xl}]}>
        <AppText variant="body" tone="secondary">
          今天想从哪里开始？
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: {
    alignItems: 'center',
  },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
