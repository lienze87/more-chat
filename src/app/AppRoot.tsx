import React, {useEffect, useMemo, useState} from 'react';
import {AppState, StyleSheet, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import {
  ensureLaunchConversation,
  flushConversations,
  useChatStore,
} from '../features/chat/chatStore';
import {
  flushSettings,
  useSettingsStore,
} from '../features/settings/settingsStore';
import {Logo} from '../ui/components/Logo';
import {AppText} from '../ui/primitives/AppText';
import {DialogHost} from '../ui/primitives/Dialog';
import {ThemeProvider, useTheme} from '../ui/theme/ThemeProvider';
import {RootNavigator} from './navigation/RootNavigator';

export function AppRoot() {
  const [ready, setReady] = useState(false);
  const themeMode = useSettingsStore(state => state.settings.themeMode);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      useSettingsStore.getState().hydrate(),
      useChatStore.getState().hydrate(),
    ])
      .then(() => {
        // 进入应用默认落到一段新对话上（复用已有的空白对话，避免堆积）。
        return ensureLaunchConversation();
      })
      .catch(error => {
        console.warn('[app] hydration failed', error);
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        flushConversations().catch(() => undefined);
        flushSettings().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider mode={themeMode}>
        {ready ? <ThemedApplication /> : <SplashScreen />}
        {/* 全局对话框：showAlert / openActionMenu 的渲染出口 */}
        <DialogHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedApplication() {
  const theme = useTheme();
  const base = theme.mode === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = useMemo(
    () => ({
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accent,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    }),
    [base, theme],
  );

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

function SplashScreen() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.splash,
        {backgroundColor: theme.colors.background, gap: theme.spacing.sm},
      ]}
    >
      <Logo size={64} />
      <View style={[styles.splashText, {gap: theme.spacing.xxs}]}>
        <AppText variant="headline" align="center">
          MoreChat
        </AppText>
        <AppText variant="footnote" tone="tertiary" align="center">
          Powered by DeepSeek
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashText: {
    alignItems: 'center',
    marginTop: 6,
  },
});
