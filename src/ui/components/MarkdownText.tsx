import React, {memo, useMemo} from 'react';
import {Linking, ScrollView, Text, View} from 'react-native';
import Markdown, {
  MarkdownIt,
  parser,
  renderRules,
  type ASTNode,
  type MarkdownProps,
  type RenderFunction,
  type RenderRules,
} from 'react-native-markdown-display';
import type {CitationAnnotation} from '../../domain/chat/types';
import {
  buildCitedMarkdown,
  citationNumberFromHref,
  isCitationHref,
} from '../../domain/chat/citations';
import {toWorkspacePath} from '../../features/extensions/filePaths';
import {useTheme} from '../theme/ThemeProvider';
import type {Theme} from '../theme/tokens';

interface MarkdownTextProps {
  content: string;
  annotations?: CitationAnnotation[];
  /** 点击 `workspace/…`、`skills/…` 或裸文件名时打开应用内文件。 */
  onOpenPath?: (path: string) => void;
}

const markdownIt = MarkdownIt({typographer: true});
// The renderer accepts an AST as children, but the library types only declare React children.
const MarkdownAst = Markdown as React.ComponentType<
  MarkdownProps & {children: ASTNode[]}
>;
const parseAst = parser as unknown as (
  source: string,
  render: (nodes: ASTNode[]) => ASTNode[],
  markdownIt: ReturnType<typeof MarkdownIt>,
) => ASTNode[];

function assignNodeKeys(nodes: ASTNode[]): ASTNode[] {
  for (const [index, node] of nodes.entries()) {
    // Keys are scoped to siblings. Appending text keeps preceding native views mounted.
    node.key = `${node.type}-${index}`;
    assignNodeKeys(node.children);
  }
  return nodes;
}

const openUrl = (url: string) => {
  Linking.openURL(url).catch(() => undefined);
};

const scrollCode =
  (render: RenderFunction): RenderFunction =>
  (node, children, parents, styles, inheritedStyles) => (
    <ScrollView key={node.key} horizontal keyboardShouldPersistTaps="handled">
      {render(node, children, parents, styles, inheritedStyles)}
    </ScrollView>
  );

const createRules = (
  citationColor: string,
  onOpenPath?: (path: string) => void,
): RenderRules => ({
  body: (node, children, parents, styles) =>
    renderRules.body!({...node, key: 'body'}, children, parents, styles),
  code_block: scrollCode(renderRules.code_block!),
  fence: scrollCode(renderRules.fence!),
  code_inline: (node, children, parents, styles) => {
    const path = onOpenPath ? toWorkspacePath(node.content ?? '') : null;
    if (path && onOpenPath) {
      return (
        <Text
          key={node.key}
          accessibilityRole="link"
          accessibilityLabel={`打开文件 ${path}`}
          suppressHighlighting
          onPress={() => onOpenPath(path)}
          style={[
            styles.code_inline,
            {color: citationColor, textDecorationLine: 'underline'},
          ]}
        >
          {node.content}
        </Text>
      );
    }
    return renderRules.code_inline!(node, children, parents, styles);
  },
  table: (node, children, parents, styles) => {
    const columns = node.children[0]?.children[0]?.children.length ?? 1;
    return (
      <ScrollView
        key={node.key}
        horizontal
        contentContainerStyle={{flexGrow: 1}}
      >
        <View style={{minWidth: columns * 112, flexGrow: 1}}>
          {renderRules.table?.(node, children, parents, styles)}
        </View>
      </ScrollView>
    );
  },
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
    const path = onOpenPath && href ? toWorkspacePath(href) : null;
    if (path && onOpenPath) {
      return (
        <Text
          key={node.key}
          accessibilityRole="link"
          accessibilityLabel={`打开文件 ${path}`}
          suppressHighlighting
          style={{
            color: citationColor,
            textDecorationLine: 'underline',
          }}
          onPress={() => onOpenPath(path)}
        >
          {children}
        </Text>
      );
    }
    return (
      <Text
        key={node.key}
        accessibilityRole="link"
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

export const MarkdownText = memo(function MarkdownText({
  content,
  annotations,
  onOpenPath,
}: MarkdownTextProps) {
  const theme = useTheme();
  const {markdown} = useMemo(
    () => buildCitedMarkdown(content, annotations),
    [content, annotations],
  );
  const nodes = useMemo(
    () => parseAst(markdown, assignNodeKeys, markdownIt),
    [markdown],
  );
  const markdownStyles = useMemo(() => createStyles(theme), [theme]);

  const rules = useMemo(
    () => createRules(theme.colors.citation, onOpenPath),
    [theme.colors.citation, onOpenPath],
  );

  return (
    <MarkdownAst style={markdownStyles} rules={rules} markdownit={markdownIt}>
      {nodes}
    </MarkdownAst>
  );
});

function createStyles(theme: Theme) {
  const {colors, spacing: s, radius: r} = theme;
  return {
    body: {
      color: colors.text,
      ...theme.typography.body,
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
