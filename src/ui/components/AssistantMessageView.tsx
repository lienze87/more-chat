import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import type {
  AssistantMessage,
  AssistantSegment,
  CitationAnnotation,
  ClientToolCall,
  ServerToolCall,
} from '../../domain/chat/types';
import {DEFAULT_REFUSAL_MESSAGE} from '../../config/appConfig';
import {copyText} from '../../utils/clipboard';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {Card} from '../primitives/Card';
import {IconButton} from '../primitives/IconButton';
import {CitationSources} from './CitationSources';
import {ClientToolCard} from './ClientToolCard';
import {MarkdownText} from './MarkdownText';
import {ThinkingBlock} from './ThinkingBlock';
import {ToolCallCard} from './ToolCallCard';
import {TypingIndicator} from './TypingIndicator';

interface AssistantMessageViewProps {
  message: AssistantMessage;
  isStreaming: boolean;
  onRegenerate: () => void;
}

type ThinkingSegment = Extract<AssistantSegment, {kind: 'thinking'}>;

type Block =
  | {
      kind: 'thinking';
      text: string;
      streaming: boolean;
      startedAt?: number;
      endedAt?: number;
    }
  | {kind: 'tool'; call: ServerToolCall}
  | {kind: 'client_tool'; call: ClientToolCall}
  | {kind: 'text'; text: string};

function toBlocks(message: AssistantMessage): Block[] {
  const blocks: Block[] = [];
  let thinking: ThinkingSegment[] = [];

  const flushThinking = () => {
    if (thinking.length === 0) {
      return;
    }
    const last = thinking[thinking.length - 1];
    let startedAt: number | undefined;
    let endedAt: number | undefined;
    for (const segment of thinking) {
      if (startedAt === undefined) {
        startedAt = segment.startedAt;
      }
      if (segment.endedAt !== undefined) {
        endedAt = segment.endedAt;
      }
    }
    blocks.push({
      kind: 'thinking',
      text: thinking.map(segment => segment.text).join('\n\n'),
      streaming: last.done !== true,
      startedAt,
      endedAt,
    });
    thinking = [];
  };

  for (const segment of message.segments as AssistantSegment[]) {
    if (segment.kind === 'thinking') {
      thinking.push(segment);
      continue;
    }
    flushThinking();
    if (segment.kind === 'tool') {
      blocks.push({kind: 'tool', call: segment.call});
    } else if (segment.kind === 'client_tool') {
      blocks.push({kind: 'client_tool', call: segment.call});
    } else if (segment.kind === 'text') {
      blocks.push({kind: 'text', text: segment.text});
    }
  }
  flushThinking();
  return blocks;
}

/** 助手消息：按时间线渲染思考块、工具卡片与 Markdown 正文。 */
export function AssistantMessageView({
  message,
  isStreaming,
  onRegenerate,
}: AssistantMessageViewProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const blocks = useMemo(() => toBlocks(message), [message]);
  const textBlocks = blocks.filter(
    (block): block is Extract<Block, {kind: 'text'}> => block.kind === 'text',
  );
  const annotations: CitationAnnotation[] =
    textBlocks.length === 1 ? message.annotations : [];

  const canCopy = message.content.trim().length > 0 && !isStreaming;

  // 复制成功的短暂反馈：图标换成对勾，1.6s 后恢复。
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    try {
      await copyText(message.content);
    } catch {
      return;
    }
    setCopied(true);
    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  }, [message.content]);
  const isEmpty =
    blocks.length === 0 && message.status === 'streaming' && isStreaming;

  return (
    <View style={{gap: spacing.xs}}>
      {blocks.map((block, index) => {
        if (block.kind === 'thinking') {
          return (
            <ThinkingBlock
              key={`thinking-${index}`}
              text={block.text}
              streaming={block.streaming && isStreaming}
              startedAt={block.startedAt}
              endedAt={block.endedAt}
            />
          );
        }
        if (block.kind === 'tool') {
          return (
            <ToolCallCard
              key={`tool-${block.call.id}-${index}`}
              call={block.call}
            />
          );
        }
        if (block.kind === 'client_tool') {
          return (
            <ClientToolCard
              key={`client-tool-${block.call.id}-${index}`}
              call={block.call}
            />
          );
        }
        return (
          <View key={`text-${index}`}>
            <MarkdownText content={block.text} annotations={annotations} />
          </View>
        );
      })}

      {isEmpty ? <TypingIndicator /> : null}

      {message.status === 'streaming' && !isEmpty ? (
        <View style={[styles.inlineStatus, {gap: 6, marginTop: spacing.xs}]}>
          <ActivityIndicator size="small" color={colors.accent} />
          <AppText variant="footnote" tone="tertiary">
            正在生成
          </AppText>
        </View>
      ) : null}

      {message.status === 'refused' ? (
        <Card
          variant="danger"
          padding="md"
          style={{marginTop: spacing.sm, gap: 4}}
        >
          <AppText variant="label" tone="danger">
            内容已拦截
          </AppText>
          <AppText variant="footnote" tone="secondary">
            {message.refusal || DEFAULT_REFUSAL_MESSAGE}
          </AppText>
        </Card>
      ) : null}

      {message.status === 'error' ? (
        <Card
          variant="danger"
          padding="md"
          style={{marginTop: spacing.sm, gap: 4}}
        >
          <AppText variant="label" tone="danger">
            生成失败
          </AppText>
          <AppText variant="footnote" tone="secondary">
            {message.error || '网络异常，请重试。'}
          </AppText>
          <View style={styles.retryRow}>
            <Button
              label="重试"
              icon="refresh"
              size="sm"
              variant="dangerSoft"
              onPress={onRegenerate}
            />
          </View>
        </Card>
      ) : null}

      {message.status === 'aborted' ? (
        <AppText
          variant="footnote"
          tone="tertiary"
          style={{marginTop: spacing.xs}}
        >
          已停止生成
        </AppText>
      ) : null}

      {message.truncated ? (
        <AppText
          variant="footnote"
          tone="warning"
          style={{marginTop: spacing.xs}}
        >
          回答已达到长度上限，内容可能不完整。
        </AppText>
      ) : null}

      <CitationSources annotations={message.annotations} />

      {canCopy || !isStreaming ? (
        <View
          style={[styles.actions, {marginTop: spacing.xs, gap: spacing.xs}]}
        >
          {canCopy ? (
            <IconButton
              name={copied ? 'checkmark' : 'copy'}
              tone={copied ? 'accent' : 'secondary'}
              size="sm"
              accessibilityLabel={copied ? '已复制' : '复制回答'}
              onPress={handleCopy}
            />
          ) : null}
          {!isStreaming ? (
            <IconButton
              name="refresh"
              tone="secondary"
              size="sm"
              accessibilityLabel="重新生成回答"
              onPress={onRegenerate}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
});
