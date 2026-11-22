import React, {createContext, useContext, useMemo, type ReactNode} from 'react';
import {useColorScheme} from 'react-native';
import type {ThemeMode} from '../../domain/settings/types';
import {
  controlSize,
  darkColors,
  iconSize,
  lightColors,
  radius,
  spacing,
  typography,
  type ResolvedThemeMode,
  type Theme,
} from './tokens';

const fallbackTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  spacing,
  radius,
  typography,
  iconSize,
  controlSize,
};

const ThemeContext = createContext<Theme>(fallbackTheme);

/** 由主题模式构造完整主题对象（颜色 / 间距 / 字号 / 阴影）。 */
export function createTheme(mode: ResolvedThemeMode): Theme {
  return {
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    typography,
    iconSize,
    controlSize,
  };
}

/**
 * 主题来源由调用方注入。
 *
 * 这样 ui/theme 与 ui/primitives 不再反向依赖 features/settings，纯展示组件
 * 的依赖图里不会出现 zustand 与 AsyncStorage。
 */
export function ThemeProvider({
  mode,
  children,
}: {
  mode: ThemeMode;
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();
  const resolved: ResolvedThemeMode =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const theme = useMemo(() => createTheme(resolved), [resolved]);
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
