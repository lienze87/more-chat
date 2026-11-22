/**
 * 设计令牌（design tokens）
 *
 * 所有颜色、间距、圆角、字号、控件尺寸都从这里取值，页面与组件不应再写死
 * 数值。改动视觉规范时只需要改这一个文件，浅色 / 深色主题同步生效。
 */

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  onAccent: string;
  userBubble: string;
  userBubbleText: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  codeBackground: string;
  codeText: string;
  citation: string;
  overlay: string;
}

/** 解析后的主题（只保留 light / dark）；用户偏好见 domain/settings 的 ThemeMode。 */
export type ResolvedThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ResolvedThemeMode;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  iconSize: typeof iconSize;
  controlSize: typeof controlSize;
}

/** 8pt 栅格：页面与组件只用这些间距。 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 40,
};

/** 圆角层级：输入框 md、卡片 lg、弹层 xl、气泡 pill 系。 */
export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  pill: 999,
};

/** 字号阶梯：最多四档正文 + 三档标题，避免出现 12.5 / 13.5 这类临时值。 */
export const typography = {
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  caption: {fontSize: 11, lineHeight: 16},
  footnote: {fontSize: 12, lineHeight: 18},
  label: {fontSize: 13, lineHeight: 18, fontWeight: '500'},
  body: {fontSize: 15, lineHeight: 23},
  title: {fontSize: 17, lineHeight: 24, fontWeight: '600'},
  headline: {fontSize: 20, lineHeight: 28, fontWeight: '700'},
} as const;

/** 图标尺寸：与字号阶梯一一对应。 */
export const iconSize = {
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
};

/** 可点击控件的统一高度，保证 iOS / Android / Web 触控目标一致。 */
export const controlSize = {
  sm: 32,
  md: 40,
};

/** 页面内容最大宽度：Web 宽屏下保持可读的阅读宽度。 */
export const layout = {
  contentMaxWidth: 760,
  dialogMaxWidth: 400,
};

export const lightColors: ThemeColors = {
  background: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF1F8',
  border: '#E1E7F0',
  borderStrong: '#C9D3E1',
  text: '#0C1424',
  textSecondary: '#586A82',
  textTertiary: '#8896AA',
  accent: '#4D6BFE',
  accentSoft: '#E9EEFF',
  accentBorder: '#C3D0FF',
  onAccent: '#FFFFFF',
  userBubble: '#E3EAFF',
  userBubbleText: '#12224A',
  danger: '#D92D20',
  dangerSoft: '#FEECEB',
  warning: '#B54708',
  codeBackground: '#F0F4F9',
  codeText: '#111A2C',
  citation: '#4D6BFE',
  overlay: 'rgba(12, 20, 36, 0.45)',
};

export const darkColors: ThemeColors = {
  background: '#090D14',
  surface: '#101722',
  surfaceMuted: '#17202D',
  border: '#1F2A3A',
  borderStrong: '#2E3C50',
  text: '#EAF0FA',
  textSecondary: '#9BACBF',
  textTertiary: '#6E7F94',
  accent: '#7089FF',
  accentSoft: '#1B2742',
  accentBorder: '#2C3C63',
  onAccent: '#FFFFFF',
  userBubble: '#1D2B4B',
  userBubbleText: '#DCE6FF',
  danger: '#F97066',
  dangerSoft: '#2A1517',
  warning: '#FDB022',
  codeBackground: '#0C131C',
  codeText: '#D7E2F2',
  citation: '#93A7FF',
  overlay: 'rgba(0, 0, 0, 0.62)',
};
