import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import type {AssistantMessage} from '../../domain/chat/types';
import {DEFAULT_REFUSAL_MESSAGE} from '../../config/appConfig';
import {copyText} from '../../adapters/platform/clipboard';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {Card} from '../primitives/Card';
import {showAlert} from '../primitives/dialogStore';
import {IconButton} from '../primitives/IconButton';
import {AskUserCard} from './AskUserCard';
import {CitationSources} from './CitationSources';
import {ClientToolCard} from './ClientToolCard';
import {MarkdownText} from './MarkdownText';
import {ThinkingBlock} from './ThinkingBlock';
import {ToolCallCard} from './ToolCallCard';
import {ToolProcessDisclosure} from './ToolProcessDisclosure';
import {TypingIndicator} from './TypingIndicator';
import {
  groupToolProcess,
  toBlocks,
  type AssistantBlock,
  type ProcessStep,
} from './assistantTimeline';

interface AssistantMessageViewProps {
  message: AssistantMessage;
  isStreaming: boolean;
  onRegenerate: () => void;
  /** 点击回复里的本地路径时打开文件预览。 */
  onOpenFile?: (path: string) => void;
}

function renderProcessStep(
  step: ProcessStep,
  index: number,
  isStreaming: boolean,
) {
  return step.kind === 'tool' ? (
    <ToolCallCard key={`tool-${step.call.id}-${index}`} call={step.call} />
  ) : (
    <ThinkingBlock
      key={`thinking-${index}`}
      text={step.text}
      streaming={step.streaming && isStreaming}
      startedAt={step.startedAt}
      endedAt={step.endedAt}
    />
  );
}

/** 助手消息：按时间线渲染思考块、工具卡片与 Markdown 正文。 */
export function AssistantMessageView({
  message,
  isStreaming,
  onRegenerate,
  onOpenFile,
}: AssistantMessageViewProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const blocks = useMemo(() => toBlocks(message), [message]);
  const textBlocks = blocks.filter(
    (block): block is Extract<AssistantBlock, {kind: 'text'}> =>
      block.kind === 'text',
  );
  const annotations = textBlocks.length === 1 ? message.annotations : undefined;
  const displayBlocks =
    !isStreaming && message.status === 'complete' && textBlocks.length > 0
      ? groupToolProcess(blocks)
      : blocks;

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
      showAlert('复制失败', '请检查应用或浏览器的剪贴板权限后重试。');
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
      {displayBlocks.map((block, index) => {
        if (block.kind === 'process') {
          return (
            <ToolProcessDisclosure
              key={`process-${index}`}
              calls={block.steps.flatMap(step =>
                step.kind === 'tool' ? [step.call] : [],
              )}
            >
              {block.steps.map((step, stepIndex) =>
                renderProcessStep(step, stepIndex, false),
              )}
            </ToolProcessDisclosure>
          );
        }
        if (block.kind === 'thinking' || block.kind === 'tool') {
          return renderProcessStep(block, index, isStreaming);
        }
        if (block.kind === 'client_tool') {
          return block.call.name === 'ask_user' ? (
            <AskUserCard
              key={`client-tool-${block.call.id}-${index}`}
              call={block.call}
            />
          ) : (
            <ClientToolCard
              key={`client-tool-${block.call.id}-${index}`}
              call={block.call}
              onOpenFile={onOpenFile}
            />
          );
        }
        return (
          <MarkdownText
            key={`text-${block.segmentIndex}`}
            content={block.text}
            annotations={annotations}
            onOpenPath={onOpenFile}
          />
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

      {canCopy || (!isStreaming && message.status !== 'error') ? (
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
          {!isStreaming && message.status !== 'error' ? (
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
