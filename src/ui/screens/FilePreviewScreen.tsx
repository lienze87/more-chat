import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {exportTextFile} from '../../adapters/files/exportTextFile';
import {readWorkspaceFile} from '../../adapters/files/workspaceFiles';
import type {RootStackParamList} from '../../app/navigation/types';
import {MarkdownText} from '../components/MarkdownText';
import {useWorkspaceQuery} from '../hooks/useWorkspaceQuery';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {showAlert} from '../primitives/dialogStore';
import {EmptyState} from '../primitives/EmptyState';
import {IconButton} from '../primitives/IconButton';
import {ContentColumn, PageHeader, Screen} from '../primitives/Screen';
import {useTheme} from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'FilePreview'>;
const exportLabel = Platform.OS === 'web' ? '下载文件' : '分享文件';

export function FilePreviewScreen({navigation, route}: Props) {
  const {path} = route.params;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const isMarkdown = /\.(?:md|markdown)$/i.test(name);
  const {colors, spacing} = useTheme();
  const {bottom} = useSafeAreaInsets();
  const load = useCallback(() => readWorkspaceFile(path), [path]);
  const {result: preview, reload} = useWorkspaceQuery(load);
  const content = preview.status === 'ready' ? preview.value : undefined;
  const [exporting, setExporting] = useState(false);

  const exportFile = async () => {
    if (content === undefined || exporting) {
      return;
    }
    setExporting(true);
    try {
      await exportTextFile(name, content);
    } catch {
      showAlert(`${exportLabel}失败`, '请稍后重试。');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title={name}
        onBack={() => navigation.goBack()}
        trailing={
          <IconButton
            name={Platform.OS === 'web' ? 'download' : 'share'}
            accessibilityLabel={exportLabel}
            disabled={content === undefined || exporting}
            onPress={exportFile}
          />
        }
      />
      <ScrollView contentContainerStyle={{paddingBottom: bottom + spacing.lg}}>
        <ContentColumn
          style={{paddingHorizontal: spacing.lg, paddingTop: spacing.lg}}
        >
          {preview.status === 'loading' ? (
            <ActivityIndicator
              color={colors.accent}
              accessibilityLabel="正在打开文件"
            />
          ) : content !== undefined ? (
            <Card>
              {content.length === 0 ? (
                <AppText tone="secondary">此文件为空。</AppText>
              ) : isMarkdown ? (
                <MarkdownText content={content} />
              ) : (
                <AppText selectable style={styles.plainText}>
                  {content}
                </AppText>
              )}
            </Card>
          ) : (
            <EmptyState
              title={
                preview.status === 'ready' ? '文件已找不到' : '无法打开文件'
              }
              action={{
                label: '重试',
                onPress: reload,
              }}
            />
          )}
        </ContentColumn>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plainText: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});
