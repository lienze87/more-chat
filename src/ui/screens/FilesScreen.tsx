import React from 'react';
import {ActivityIndicator, FlatList} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  listWorkspacePaths,
  WORKSPACE_ROOT,
} from '../../adapters/files/workspaceFiles';
import type {RootStackParamList} from '../navigation/types';
import {useWorkspaceQuery} from '../hooks/useWorkspaceQuery';
import {Divider} from '../primitives/Divider';
import {EmptyState} from '../primitives/EmptyState';
import {Icon} from '../primitives/Icon';
import {IconButton} from '../primitives/IconButton';
import {ListRow} from '../primitives/ListRow';
import {ContentColumn, PageHeader, Screen} from '../primitives/Screen';
import {useTheme} from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Files'>;

const listFiles = async () =>
  (await listWorkspacePaths()).sort((a, b) => a.localeCompare(b));

export function FilesScreen({navigation}: Props) {
  const {colors, iconSize, spacing} = useTheme();
  const {bottom} = useSafeAreaInsets();
  const {result, reload} = useWorkspaceQuery(listFiles);

  return (
    <Screen>
      <PageHeader
        title="文件"
        onBack={() => navigation.goBack()}
        trailing={
          <IconButton
            name="refresh"
            accessibilityLabel="刷新文件列表"
            disabled={result.status === 'loading'}
            onPress={reload}
          />
        }
      />
      <ContentColumn
        style={{flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg}}
      >
        {result.status === 'loading' ? (
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="正在加载文件"
          />
        ) : result.status === 'error' ? (
          <EmptyState
            title="无法加载文件"
            action={{label: '重试', onPress: reload}}
          />
        ) : (
          <FlatList
            data={result.value}
            keyExtractor={path => path}
            contentContainerStyle={{paddingBottom: bottom + spacing.lg}}
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={
              <EmptyState
                artwork={
                  <Icon name="folder" size={iconSize.xl} tone="accent" />
                }
                title="还没有文件"
                description="在聊天中请助手将内容保存为 Markdown 或 JSON，文件就会出现在这里。"
              />
            }
            renderItem={({item: path}) => {
              const split = path.lastIndexOf('/');
              const folder = path.slice(WORKSPACE_ROOT.length + 1, split);
              return (
                <ListRow
                  label={path.slice(split + 1)}
                  description={folder || undefined}
                  right={
                    <Icon
                      name="chevronRight"
                      size={iconSize.sm}
                      tone="tertiary"
                    />
                  }
                  onPress={() => navigation.navigate('FilePreview', {path})}
                />
              );
            }}
          />
        )}
      </ContentColumn>
    </Screen>
  );
}
