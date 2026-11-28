import React, {useRef, useState} from 'react';
import {ActivityIndicator, FlatList, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import {pickSkillFile} from '../../adapters/files/importFile';
import {parseSkillPackage} from '../../features/extensions/skillPackage';
import {useSkillsStore} from '../../features/extensions/skillsStore';
import {SkillFormDialog} from '../components/SkillFormDialog';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {showAlert} from '../primitives/dialogStore';
import {Divider} from '../primitives/Divider';
import {EmptyState} from '../primitives/EmptyState';
import {Icon} from '../primitives/Icon';
import {IconButton} from '../primitives/IconButton';
import {ListRow} from '../primitives/ListRow';
import {ContentColumn, PageHeader, Screen} from '../primitives/Screen';
import {Toggle} from '../primitives/Toggle';
import {useTheme} from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Extensions'>;

export function ExtensionsScreen({navigation}: Props) {
  const {colors, iconSize, spacing} = useTheme();
  const {bottom} = useSafeAreaInsets();
  const skills = useSkillsStore(state => state.skills);
  const loading = useSkillsStore(state => state.loading);
  const error = useSkillsStore(state => state.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<'github' | 'create' | null>(null);
  const inProgress = useRef(false);
  const addDisabled = busy || loading || !!error;

  const perform = async (title: string, action: () => Promise<void>) => {
    if (inProgress.current) {
      return;
    }
    inProgress.current = true;
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      showAlert(
        title,
        failure instanceof Error ? failure.message : '请稍后重试。',
      );
    } finally {
      inProgress.current = false;
      setBusy(false);
    }
  };

  const importSkill = () =>
    perform('导入失败', async () => {
      const file = await pickSkillFile();
      if (file) {
        await useSkillsStore
          .getState()
          .install(parseSkillPackage(file.name, file.bytes));
      }
    });

  const confirmRemoval = (name: string) =>
    showAlert('移除 Skill', `将从 MoreChat 移除 ${name} 及其参考文件。`, [
      {text: '取消', style: 'cancel'},
      {
        text: '移除',
        style: 'destructive',
        onPress: () =>
          perform('移除失败', () => useSkillsStore.getState().remove(name)),
      },
    ]);

  return (
    <Screen>
      <PageHeader title="扩展管理" onBack={() => navigation.goBack()} />
      <ContentColumn style={{flex: 1, paddingHorizontal: spacing.lg}}>
        <View
          style={{
            gap: spacing.md,
            paddingVertical: spacing.lg,
          }}
        >
          <AppText variant="title">Skill</AppText>
          <View
            style={{flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm}}
          >
            <Button
              label="导入 ZIP"
              variant="secondary"
              size="sm"
              disabled={addDisabled}
              onPress={importSkill}
            />
            <Button
              label="从 GitHub 导入"
              variant="secondary"
              size="sm"
              disabled={addDisabled}
              onPress={() => setForm('github')}
            />
            <Button
              label="新建 Skill"
              icon="plus"
              variant="soft"
              size="sm"
              disabled={addDisabled}
              onPress={() => setForm('create')}
            />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="正在加载 Skill"
          />
        ) : error ? (
          <EmptyState
            title="无法加载 Skill"
            description={error}
            action={{
              label: '重试',
              onPress: () => useSkillsStore.getState().hydrate(),
            }}
          />
        ) : (
          <FlatList
            data={skills}
            keyExtractor={skill => skill.name}
            extraData={busy}
            contentContainerStyle={{paddingBottom: bottom + spacing.lg}}
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={
              <EmptyState
                artwork={
                  <Icon name="extensions" size={iconSize.xl} tone="accent" />
                }
                title="还没有 Skill"
                description="启用后，助手会按任务需要读取 Skill。"
              />
            }
            renderItem={({item}) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.surface,
                  paddingRight: spacing.md,
                }}
              >
                <View style={{flex: 1}}>
                  <ListRow
                    label={item.name}
                    description={item.description}
                    accessibilityRole="switch"
                    accessibilityState={{checked: item.enabled, disabled: busy}}
                    right={<Toggle value={item.enabled} />}
                    onPress={() =>
                      perform('更新失败', () =>
                        useSkillsStore.getState().toggle(item.name),
                      )
                    }
                  />
                </View>
                <IconButton
                  name="trash"
                  size="sm"
                  accessibilityLabel={`移除 ${item.name}`}
                  disabled={busy}
                  onPress={() => confirmRemoval(item.name)}
                />
              </View>
            )}
          />
        )}
      </ContentColumn>
      {form ? (
        <SkillFormDialog mode={form} onClose={() => setForm(null)} />
      ) : null}
    </Screen>
  );
}
