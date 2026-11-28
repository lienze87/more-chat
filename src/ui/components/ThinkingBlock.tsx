import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';
import {formatDuration} from '../../utils/text';

interface ThinkingBlockProps {
  text: string;
  streaming: boolean;
  /** 思考开始的绝对时间。 */
  startedAt: number;
  /** 思考结束的绝对时间；仍在生成时为空。 */
  endedAt?: number;
}

/** 深度思考过程：按需展开，流式期间实时刷新耗时。 */
export function ThinkingBlock({
  text,
  streaming,
  startedAt,
  endedAt,
}: ThinkingBlockProps) {
  const theme = useTheme();
  const {spacing} = theme;
  const [expanded, setExpanded] = React.useState(false);

  // 流式期间每秒刷新一次，让「用时」跟着走；结束后改用 endedAt。
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!streaming) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [streaming]);

  const elapsedMs = Math.max(
    0,
    (streaming ? now : (endedAt ?? now)) - startedAt,
  );
  const showDuration = streaming || endedAt !== undefined;
  const label = streaming ? '正在思考' : '已思考';
  const duration = showDuration ? `（用时 ${formatDuration(elapsedMs)}）` : '';

  return (
    <Card variant="muted" padding="none" style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? '收起思考过程' : '展开思考过程'}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [
          styles.header,
          webPointer,
          {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            minHeight: theme.controlSize.touch,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon name="spark" size={theme.iconSize.sm} tone="accent" />
        <AppText variant="label" tone="secondary" style={styles.label}>
          {`${label}${duration}`}
        </AppText>
        <Icon
          name={expanded ? 'chevronUp' : 'chevronDown'}
          size={theme.iconSize.sm}
          tone="tertiary"
        />
      </Pressable>
      {expanded ? (
        <View
          style={{paddingHorizontal: spacing.md, paddingBottom: spacing.md}}
        >
          <AppText variant="footnote" tone="secondary">
            {text}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    flex: 1,
  },
});
