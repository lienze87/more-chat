import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';

/** 首个 token 到达前的占位提示。 */
export function TypingIndicator() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <ActivityIndicator size="small" color={theme.colors.accent} />
      <AppText variant="body" tone="secondary">
        正在生成…
      </AppText>
    </View>
  );
}
