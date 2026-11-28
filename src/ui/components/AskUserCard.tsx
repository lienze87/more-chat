import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {ASK_USER_LIMITS} from '../../config/appConfig';
import type {ClientToolCall} from '../../domain/chat/types';
import {
  parseAskUserPrompt,
  parseAskUserResult,
  useAskUserStore,
  type AskUserAnswer,
  type AskUserOption,
} from '../../features/extensions/askUser';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {Card} from '../primitives/Card';
import {Icon} from '../primitives/Icon';
import {TextField} from '../primitives/TextField';
import {webPointer} from '../primitives/interaction';
import {useTheme} from '../theme/ThemeProvider';
import {ClientToolCard} from './ClientToolCard';

interface AskUserCardProps {
  call: ClientToolCall;
}

function OptionRow({
  option,
  selected,
  multi,
  disabled,
  onPress,
}: {
  option: AskUserOption;
  selected: boolean;
  multi: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const {colors, spacing, radius} = theme;
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityLabel={
        option.description
          ? `${option.label}，${option.description}`
          : option.label
      }
      accessibilityState={{checked: selected, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.option,
        webPointer,
        {
          borderColor: selected ? colors.accent : colors.borderStrong,
          borderRadius: radius.md,
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          minHeight: theme.controlSize.touch,
          gap: spacing.sm,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.indicator,
          {
            borderColor: selected ? colors.accent : colors.borderStrong,
            borderRadius: multi ? 4 : 10,
            backgroundColor: selected ? colors.accent : 'transparent',
          },
        ]}
      >
        {selected ? (
          <Icon
            name="checkmark"
            size={12}
            color={colors.onAccent}
            style={styles.indicatorIcon}
          />
        ) : null}
      </View>
      <View style={styles.optionText}>
        <AppText variant="label">{option.label}</AppText>
        {option.description ? (
          <AppText variant="caption" tone="tertiary">
            {option.description}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function AskUserCountdown({
  expiresAt,
  timeoutMs,
  paused,
  remainingMs,
}: {
  expiresAt: number;
  timeoutMs: number;
  paused: boolean;
  remainingMs: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paused) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [paused]);

  const totalSeconds = Math.ceil(timeoutMs / 1000);
  const remainingSeconds = paused
    ? Math.ceil(remainingMs / 1000)
    : Math.min(totalSeconds, Math.max(0, Math.ceil((expiresAt - now) / 1000)));

  return (
    <AppText variant="caption" tone="tertiary">
      {paused
        ? `${totalSeconds} 秒内未确认将自动继续 · 已暂停（剩余 ${remainingSeconds} 秒）`
        : remainingSeconds > 0
          ? `${totalSeconds} 秒内未确认将自动继续 · 剩余 ${remainingSeconds} 秒`
          : '时间到，正在继续…'}
    </AppText>
  );
}

/**
 * `ask_user` 的工具卡片：选项、多选、自定义回答。
 *
 * 待回答时先选择选项或在输入框补充，点“确定”后写入提问队列；回答后展示
 * 静态结果，历史回放仍然看得到当时选了什么。
 */
export function AskUserCard({call}: AskUserCardProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const prompt = useMemo(() => parseAskUserPrompt(call), [call]);
  const result = useMemo(() => parseAskUserResult(call.result), [call]);
  const pending = useAskUserStore(state => state.pending[call.id]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // 输入框聚焦会暂停计时，但卸载或应用退到后台时不一定触发 onBlur；
    // 这里在两种情况下恢复剩余计时，避免本轮一直等待。
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        useAskUserStore.getState().resume(call.id);
      }
    });
    return () => {
      subscription.remove();
      useAskUserStore.getState().resume(call.id);
    };
  }, [call.id]);

  if (!prompt) {
    return <ClientToolCard call={call} />;
  }

  const answer = (value: AskUserAnswer) => {
    if (sent) {
      return;
    }
    setSent(true);
    useAskUserStore.getState().submit(call.id, value);
  };

  const toggle = (label: string) =>
    setSelected(current =>
      current.includes(label)
        ? current.filter(item => item !== label)
        : [...current, label],
    );

  if (result) {
    if (result.timedOut) {
      return (
        <Card
          variant="accent"
          style={[styles.card, {gap: spacing.xs}]}
          accessibilityLabel="问题等待超时"
        >
          <View style={[styles.header, {gap: spacing.xs}]}>
            <Icon name="timer" size={theme.iconSize.sm} tone="accent" />
            <AppText variant="label" tone="accent">
              {prompt.header ?? '等待超时'}
            </AppText>
          </View>
          <AppText variant="body">{prompt.question}</AppText>
          <AppText variant="footnote" tone="secondary">
            {`用户未在 ${ASK_USER_LIMITS.timeoutMs / 1000} 秒内选择，已自动继续。`}
          </AppText>
        </Card>
      );
    }
    return (
      <Card
        variant="accent"
        style={[styles.card, {gap: spacing.sm}]}
        accessibilityLabel="已回答的问题"
      >
        <View style={[styles.header, {gap: spacing.xs}]}>
          <Icon name="checkmarkCircle" size={theme.iconSize.sm} tone="accent" />
          <AppText variant="label" tone="accent">
            {prompt.header ?? '你的选择'}
          </AppText>
        </View>
        <AppText variant="body">{prompt.question}</AppText>
        <View style={{gap: spacing.xs}}>
          {result.selected.map(label => (
            <View
              key={label}
              style={[
                styles.answerPill,
                {
                  borderColor: colors.accentBorder,
                  backgroundColor: colors.surface,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Icon name="checkmark" size={12} tone="accent" />
              <AppText variant="footnote" style={styles.answerText}>
                {label}
              </AppText>
            </View>
          ))}
          {result.custom ? (
            <AppText variant="footnote" tone="secondary">
              自定义回答：{result.custom}
            </AppText>
          ) : null}
        </View>
      </Card>
    );
  }

  if (call.status === 'failed') {
    return (
      <Card variant="danger" style={[styles.card, {gap: spacing.xs}]}>
        <AppText variant="label" tone="danger">
          未能完成提问
        </AppText>
        <AppText variant="footnote" tone="secondary">
          {call.error || '本轮已停止，请重新发送消息。'}
        </AppText>
      </Card>
    );
  }

  if (call.status === 'completed') {
    // 兼容旧数据或异常结果：回答已经结束但无法解析时退回通用工具卡片。
    return <ClientToolCard call={call} />;
  }

  const waiting = !pending;
  const canAnswer = pending !== undefined && !sent;
  const customAnswer = custom.trim();
  const canSubmit =
    canAnswer && (selected.length > 0 || customAnswer.length > 0);

  const choose = (label: string) => {
    if (!canAnswer) {
      return;
    }
    if (prompt.multiSelect) {
      toggle(label);
    } else {
      setSelected([label]);
    }
  };

  const confirm = () => {
    if (!canSubmit) {
      return;
    }
    answer({
      selected,
      ...(customAnswer ? {custom: customAnswer} : {}),
    });
  };

  return (
    <Card variant="accent" style={[styles.card, {gap: spacing.md}]}>
      <View style={{gap: spacing.xs}}>
        <View style={[styles.header, {gap: spacing.xs}]}>
          <Icon name="question" size={theme.iconSize.sm} tone="accent" />
          <AppText variant="label" tone="accent">
            {prompt.header ?? '需要你的选择'}
          </AppText>
          {waiting ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : null}
        </View>
        <AppText variant="body">{prompt.question}</AppText>
      </View>

      {prompt.options.length > 0 ? (
        <View style={{gap: spacing.xs}}>
          {prompt.options.map(option => (
            <OptionRow
              key={option.label}
              option={option}
              multi={prompt.multiSelect}
              selected={selected.includes(option.label)}
              disabled={!canAnswer}
              onPress={() => choose(option.label)}
            />
          ))}
        </View>
      ) : null}

      <TextField
        value={custom}
        onChangeText={setCustom}
        placeholder="其他回答"
        accessibilityLabel="其他回答"
        editable={canAnswer}
        maxLength={ASK_USER_LIMITS.maxCustomAnswerLength}
        onSubmitEditing={confirm}
        onFocus={() => useAskUserStore.getState().pause(call.id)}
        onBlur={() => useAskUserStore.getState().resume(call.id)}
        submitOnReturn
      />

      <Button label="确定" onPress={confirm} disabled={!canSubmit} fullWidth />

      {waiting ? (
        <AppText variant="caption" tone="tertiary">
          {sent ? '已提交，正在继续生成…' : '等待问题就绪…'}
        </AppText>
      ) : pending ? (
        <AskUserCountdown
          key={`${pending.expiresAt}-${pending.paused ? 'paused' : 'running'}`}
          expiresAt={pending.expiresAt}
          timeoutMs={pending.timeoutMs}
          paused={pending.paused}
          remainingMs={pending.remainingMs}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  indicator: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorIcon: {
    textAlign: 'center',
  },
  optionText: {
    flex: 1,
    gap: 1,
  },
  answerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  answerText: {
    flexShrink: 1,
  },
});
