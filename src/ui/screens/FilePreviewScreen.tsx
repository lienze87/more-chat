import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {exportTextFile} from '../../adapters/files/exportTextFile';
import {readWorkspaceFile} from '../../adapters/files/workspaceFiles';
import type {RootStackParamList} from '../../app/navigation/types';
import {
  imageMimeType,
  skillPathParts,
  toLocalFilePath,
} from '../../features/extensions/filePaths';
import {useSkillsStore} from '../../features/extensions/skillsStore';
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
  const imageMime = imageMimeType(path);
  const {colors, spacing} = useTheme();
  const {bottom} = useSafeAreaInsets();
  const load = useCallback(async () => {
    const target = toLocalFilePath(path);
    if (!target) {
      return undefined;
    }
    const skill = skillPathParts(target);
    if (skill) {
      // 预览由用户主动打开，读取任意已安装的只读 Skill；
      // 模型工具仍只开放启用的 Skill，鉴权差异留在工具层。
      const files = useSkillsStore
        .getState()
        .skills.find(item => item.name === skill.name)?.files;
      return files && Object.hasOwn(files, skill.relative)
        ? files[skill.relative]
        : undefined;
    }
    return readWorkspaceFile(target);
  }, [path]);
  const openFile = useCallback(
    (target: string) => {
      if (target !== path) {
        navigation.push('FilePreview', {path: target});
      }
    },
    [navigation, path],
  );
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
          imageMime ? undefined : (
            <IconButton
              name={Platform.OS === 'web' ? 'download' : 'share'}
              accessibilityLabel={exportLabel}
              disabled={content === undefined || exporting}
              onPress={exportFile}
            />
          )
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
              {imageMime ? (
                <Image
                  source={{uri: `data:${imageMime};base64,${content}`}}
                  style={styles.image}
                  resizeMode="contain"
                  accessibilityLabel={name}
                />
              ) : content.length === 0 ? (
                <AppText tone="secondary">此文件为空。</AppText>
              ) : isMarkdown ? (
                <MarkdownText content={content} onOpenPath={openFile} />
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
  image: {
    width: '100%',
    height: 280,
  },
});
