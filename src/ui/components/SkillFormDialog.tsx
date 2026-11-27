import React, {useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {SKILL_LIMITS} from '../../config/appConfig';
import {importGitHubSkill} from '../../features/extensions/githubSkill';
import {createSkillPackage} from '../../features/extensions/skillPackage';
import {useSkillsStore} from '../../features/extensions/skillsStore';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {TextField} from '../primitives/TextField';
import {useTheme} from '../theme/ThemeProvider';
import {layout} from '../theme/tokens';

export function SkillFormDialog({
  mode,
  onClose,
}: {
  mode: 'github' | 'create';
  onClose: () => void;
}) {
  const {colors, radius, spacing} = useTheme();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const github = mode === 'github';
  const title = github ? '从 GitHub 导入' : '新建 Skill';
  const ready = github
    ? !!url.trim()
    : !!(name.trim() && description.trim() && body.trim());

  const submit = async () => {
    if (!ready || submitting.current) {
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const skill = github
        ? await importGitHubSkill(url)
        : createSkillPackage(name, description, body);
      await useSkillsStore.getState().install(skill);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '请稍后重试。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!submitting.current) {
      onClose();
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.backdrop,
          {backgroundColor: colors.overlay, padding: spacing.xl},
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: spacing.md,
            },
          ]}
        >
          <AppText variant="title">{title}</AppText>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={{gap: spacing.md}}
          >
            {github ? (
              <TextField
                label="GitHub URL"
                description="粘贴公开仓库中包含 SKILL.md 的目录链接，或 SKILL.md 文件链接。"
                placeholder="https://github.com/…"
                keyboardType="url"
                value={url}
                onChangeText={setUrl}
                onSubmitEditing={submit}
                editable={!busy}
              />
            ) : (
              <>
                <TextField
                  label="技能名称"
                  placeholder="例如 notes-helper"
                  description="使用小写字母、数字和连字符。"
                  value={name}
                  onChangeText={setName}
                  maxLength={SKILL_LIMITS.maxNameLength}
                  editable={!busy}
                />
                <TextField
                  label="描述"
                  placeholder="说明何时使用此 Skill"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={SKILL_LIMITS.maxDescriptionLength}
                  editable={!busy}
                />
                <TextField
                  label="正文"
                  placeholder="填写技能指令，支持 Markdown"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  editable={!busy}
                />
              </>
            )}
            {error ? (
              <AppText
                variant="footnote"
                tone="danger"
                accessibilityLiveRegion="polite"
              >
                {error}
              </AppText>
            ) : null}
          </ScrollView>
          <View style={[styles.actions, {gap: spacing.sm}]}>
            <Button
              label="取消"
              variant="secondary"
              onPress={cancel}
              disabled={busy}
              style={styles.action}
            />
            <Button
              label={
                busy
                  ? github
                    ? '正在导入…'
                    : '正在保存…'
                  : github
                    ? '导入'
                    : '创建'
              }
              onPress={submit}
              disabled={busy || !ready}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  card: {width: '100%', maxWidth: layout.dialogMaxWidth, maxHeight: '100%'},
  scroll: {flexGrow: 0, flexShrink: 1},
  actions: {flexDirection: 'row'},
  action: {flex: 1},
});
