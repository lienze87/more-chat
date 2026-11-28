import React, {useState, type ReactNode} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {ServerToolCall} from '../../domain/chat/types';
import {AppText} from '../primitives/AppText';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';
import {useTheme} from '../theme/ThemeProvider';
import {presentServerToolProcess} from './serverToolPresentation';

export function ToolProcessDisclosure({
  calls,
  children,
}: {
  calls: ServerToolCall[];
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const {colors, spacing, controlSize, iconSize} = useTheme();
  const label = presentServerToolProcess(calls);

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
