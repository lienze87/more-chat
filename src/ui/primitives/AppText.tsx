import React from 'react';
import {
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {typography, type ThemeColors} from '../theme/tokens';

export type TextVariant = keyof typeof typography;

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'danger'
  | 'warning'
  | 'citation'
  | 'userBubble';

export function textToneColor(colors: ThemeColors, tone: TextTone): string {
  switch (tone) {
    case 'accent':
      return colors.accent;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    case 'citation':
      return colors.citation;
    case 'userBubble':
      return colors.userBubbleText;
    case 'secondary':
      return colors.textSecondary;
    case 'tertiary':
      return colors.textTertiary;
    case 'primary':
    default:
      return colors.text;
  }
}

export interface AppTextProps extends TextProps {
  /** 字号阶梯，对应 `theme.typography`。 */
  variant?: TextVariant;
  /** 语义色，避免在页面里逐个指定颜色。 */
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/**
 * 统一文本组件：字号、行高、颜色全部来自设计令牌。
 *
 * 页面里不再出现 `fontSize: 12.5` 这类临时值；需要强调时选 `title`，正文选
 * `body`，辅助信息选 `footnote` / `caption`，标签选 `label`。
 */
export function AppText({
  variant = 'body',
  tone = 'primary',
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...rest}
      style={[
        theme.typography[variant],
        {color: textToneColor(theme.colors, tone)},
        align ? {textAlign: align} : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
