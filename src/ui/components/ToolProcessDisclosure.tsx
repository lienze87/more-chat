import React, {useState, type ReactNode} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {ServerToolCall} from '../../domain/chat/types';
import {AppText} from '../primitives/AppText';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';
import {useTheme} from '../theme/ThemeProvider';

function describeProcess(calls: ServerToolCall[]): string {
  const labels: string[] = [];
  if (calls.some(call => call.action?.type === 'search')) {
    labels.push('联网搜索');
  }
  const pages = new Set<string>();
  for (const call of calls) {
    const action = call.action;
    if (
      call.status === 'completed' &&
      (action?.type === 'open_page' || action?.type === 'read_link')
    ) {
      const url = call.page?.url ?? action.url;
      if (typeof url === 'string' && url) {
        pages.add(url);
      }
    }
  }
  if (pages.size > 0) {
    labels.push(`阅读 ${pages.size} 个网页`);
  }
  return labels.join(' · ') || `网页工具 · ${calls.length} 个步骤`;
}

export function ToolProcessDisclosure({
  calls,
  children,
}: {
  calls: ServerToolCall[];
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const {colors, spacing, controlSize, iconSize} = useTheme();
  const label = describeProcess(calls);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [
          styles.row,
          webPointer,
          {
            gap: spacing.sm,
            minHeight: controlSize.touch,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon name="globe" size={iconSize.sm} color={colors.textSecondary} />
        <AppText variant="label" tone="secondary" style={styles.label}>
          {label}
        </AppText>
        <Icon
          name={expanded ? 'chevronUp' : 'chevronDown'}
          size={iconSize.sm}
          tone="tertiary"
        />
      </Pressable>
      {expanded ? <View style={{gap: spacing.xs}}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center'},
  label: {flex: 1},
});
