import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {CitationAnnotation} from '../../domain/chat/types';
import {extractCitationSources} from '../../domain/chat/citations';
import {openExternalUrl} from '../../adapters/platform/linking';
import {hostOf} from '../../utils/url';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {webPointer} from '../primitives/interaction';

interface CitationSourcesProps {
  annotations: CitationAnnotation[] | undefined;
}

/** 参考来源列表：与正文中的 [n] 角标对应。 */
export function CitationSources({annotations}: CitationSourcesProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const sources = extractCitationSources(annotations);
  if (sources.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          borderTopColor: colors.border,
          marginTop: spacing.md,
          paddingTop: spacing.sm,
          gap: spacing.sm,
        },
      ]}
    >
      <AppText variant="overline" tone="tertiary">
        参考来源
      </AppText>
      {sources.map(source => (
        <Pressable
          key={source.url}
          accessibilityRole="link"
          accessibilityLabel={source.title}
          onPress={() => openExternalUrl(source.url)}
          style={({pressed}) => [
            styles.row,
            webPointer,
            {
              minHeight: theme.controlSize.touch,
              gap: spacing.sm,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <AppText variant="caption" tone="citation" style={styles.number}>
            {source.number}
          </AppText>
          <View style={styles.textColumn}>
            <AppText variant="footnote" tone="secondary" numberOfLines={2}>
              {source.title}
            </AppText>
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {hostOf(source.url)}
            </AppText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  number: {
    fontWeight: '700',
    minWidth: 14,
    marginTop: 2,
  },
  textColumn: {
    flex: 1,
  },
});
