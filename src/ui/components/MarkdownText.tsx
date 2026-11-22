import React, {useMemo} from 'react';
import {Linking, Text} from 'react-native';
import Markdown from 'react-native-markdown-display';
import type {CitationAnnotation} from '../../domain/chat/types';
import {
  buildCitedMarkdown,
  citationNumberFromHref,
  isCitationHref,
} from '../../domain/chat/citations';
import {useTheme} from '../theme/ThemeProvider';
import type {Theme} from '../theme/tokens';

interface MarkdownTextProps {
  content: string;
  annotations?: CitationAnnotation[];
}

const openUrl = (url: string) => {
  Linking.openURL(url).catch(() => undefined);
};

// 在模块作用域创建 markdown-it 渲染规则，避免每次渲染都生成新的组件函数。
const createRules = (citationColor: string) => ({
  link: (
    node: {key: string; attributes?: {href?: string}},
    children: React.ReactNode[],
  ) => {
    const href = node.attributes?.href;
    if (isCitationHref(href) && href) {
      return (
        <Text
          key={node.key}
          suppressHighlighting
          style={{
            color: citationColor,
            fontSize: 11,
            lineHeight: 20,
          }}
        >
          {`[${citationNumberFromHref(href)}]`}
        </Text>
      );
    }
    return (
      <Text
        key={node.key}
        suppressHighlighting
        style={{
          color: citationColor,
          textDecorationLine: 'underline',
        }}
        onPress={() => href && openUrl(href)}
      >
        {children}
      </Text>
    );
  },
});

export function MarkdownText({content, annotations}: MarkdownTextProps) {
  const theme = useTheme();
  const {markdown} = useMemo(
    () => buildCitedMarkdown(content, annotations),
    [content, annotations],
  );
  const markdownStyles = useMemo(() => createStyles(theme), [theme]);

  const rules = useMemo(
    () => createRules(theme.colors.citation),
    [theme.colors.citation],
  );

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {markdown}
    </Markdown>
  );
}

function createStyles(theme: Theme) {
  const {colors, spacing: s, radius: r} = theme;
  return {
    body: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 24,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: s.sm,
    },
    heading1: {
      color: colors.text,
      fontSize: 21,
      lineHeight: 28,
      fontWeight: '700' as const,
      marginTop: s.md,
      marginBottom: s.sm,
    },
    heading2: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '700' as const,
      marginTop: s.md,
      marginBottom: s.xs,
    },
    heading3: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 23,
      fontWeight: '600' as const,
      marginTop: s.sm,
      marginBottom: s.xs,
    },
    heading4: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    heading5: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600' as const,
    },
    heading6: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600' as const,
    },
    strong: {
      fontWeight: '700' as const,
      color: colors.text,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    link: {
      color: colors.citation,
    },
    blockquote: {
      backgroundColor: colors.surfaceMuted,
      borderLeftColor: colors.accent,
      borderLeftWidth: 3,
      paddingHorizontal: s.md,
      paddingVertical: s.sm,
      borderRadius: r.sm,
      marginVertical: s.sm,
    },
    code_inline: {
      backgroundColor: colors.codeBackground,
      color: colors.codeText,
      fontFamily: 'monospace',
      fontSize: 13,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    code_block: {
      backgroundColor: colors.codeBackground,
      color: colors.codeText,
      fontFamily: 'monospace',
      fontSize: 13,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: r.md,
      padding: s.md,
      marginVertical: s.sm,
    },
    fence: {
      backgroundColor: colors.codeBackground,
      color: colors.codeText,
      fontFamily: 'monospace',
      fontSize: 13,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: r.md,
      padding: s.md,
      marginVertical: s.sm,
    },
    bullet_list: {
      marginVertical: s.xs,
    },
    ordered_list: {
      marginVertical: s.xs,
    },
    list_item: {
      marginBottom: s.xs,
    },
    bullet_list_icon: {
      color: colors.textSecondary,
      marginRight: s.xs,
    },
    ordered_list_icon: {
      color: colors.textSecondary,
      marginRight: s.xs,
    },
    table: {
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: r.sm,
      marginVertical: s.sm,
    },
    thead: {
      backgroundColor: colors.surfaceMuted,
    },
    th: {
      color: colors.text,
      fontWeight: '600' as const,
      padding: s.sm,
    },
    td: {
      color: colors.text,
      padding: s.sm,
    },
    tr: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: s.md,
    },
    image: {
      borderRadius: r.md,
    },
  };
}
/** Markdown 正文渲染：字号、颜色、代码块样式全部来自主题令牌。 */
