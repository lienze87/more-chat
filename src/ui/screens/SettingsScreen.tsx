import React, {useState} from 'react';
import {Linking, Platform, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import {
  MODEL_PRESETS,
  type ReasoningEffort,
  type SafetyLevel,
  type ThemeMode,
} from '../../domain/settings/types';
import {useChatStore} from '../../features/chat/chatStore';
import {deleteAllConversations} from '../../features/chat/chatEngine';
import {
  flushSettings,
  useSettingsStore,
} from '../../features/settings/settingsStore';
import {APP_VERSION} from '../../config/appConfig';
import {showAlert} from '../primitives/dialogStore';
import {
  ActionRow,
  Divider,
  Section,
  SegmentedControl,
  SettingsTextField,
  SettingRow,
  SwitchRow,
} from '../components/Settings';
import {AppText} from '../primitives/AppText';
import {Chip} from '../primitives/Chip';
import {ContentColumn, PageHeader, Screen} from '../primitives/Screen';
import {TextField} from '../primitives/TextField';
import {useSyncedDraft} from '../hooks/useSyncedDraft';
import {useTheme} from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const openDocs = () => {
  Linking.openURL(
    'https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot/',
  ).catch(() => undefined);
};

/** 设置页：接口、对话能力、用户信息、提示词、外观、数据、关于。 */
export function SettingsScreen({navigation}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore(state => state.settings);
  const apiKey = useSettingsStore(state => state.apiKey);
  const apiKeyError = useSettingsStore(state => state.apiKeyError);
  const savingApiKey = useSettingsStore(state => state.savingApiKey);
  const setApiKey = useSettingsStore(state => state.setApiKey);
  const updateSettings = useSettingsStore(state => state.updateSettings);
  const resetSettings = useSettingsStore(state => state.resetSettings);
  const conversationCount = useChatStore(state => state.conversations.length);

  const [keyDraft, setKeyDraft] = useSyncedDraft(apiKey);
  const [revealKey, setRevealKey] = useState(false);

  const commitKey = () => {
    void setApiKey(keyDraft);
  };
  const saveTextSetting = (key: 'location' | 'systemPrompt', value: string) => {
    updateSettings({[key]: value});
    void flushSettings().catch(() => undefined);
  };
  const web = Platform.OS === 'web';
  const keyStatus = savingApiKey
    ? '正在保存…'
    : apiKey
      ? web
        ? '当前页面已配置'
        : '已保存'
      : '尚未配置';

  const confirmClearAll = () => {
    showAlert(
      '清空全部对话',
      `将删除 ${conversationCount} 个对话，操作无法恢复。`,
      [
        {text: '取消', style: 'cancel'},
        {
          text: '清空',
          style: 'destructive',
          onPress: deleteAllConversations,
        },
      ],
    );
  };

  const confirmReset = () => {
    showAlert(
      '恢复默认设置',
      '仅重置模型、附加提示词与界面设置，不会删除 API Key 和对话记录。',
      [
        {text: '取消', style: 'cancel'},
        {text: '恢复', style: 'destructive', onPress: () => resetSettings()},
      ],
    );
  };

  return (
    <Screen edges={['top']}>
      <PageHeader title="设置" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{paddingBottom: insets.bottom + 32}}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ContentColumn style={styles.content}>
          <Section
            title="接口"
            footer={
              web
                ? 'API Key 仅用于当前页面，刷新后需重新填写。'
                : 'API Key 由系统凭据存储保护。'
            }
          >
            <View
              style={[
                styles.block,
                {padding: theme.spacing.lg, gap: theme.spacing.sm},
              ]}
            >
              <TextField
                label="DeepSeek API Key"
                value={keyDraft}
                onChangeText={setKeyDraft}
                onBlur={commitKey}
                onSubmitEditing={commitKey}
                editable={!savingApiKey}
                secureTextEntry={!revealKey}
                placeholder="sk-..."
                accessory={
                  <AppText
                    variant="label"
                    tone="accent"
                    onPress={() => setRevealKey(value => !value)}
                    suppressHighlighting
                  >
                    {revealKey ? '隐藏' : '显示'}
                  </AppText>
                }
              />
              <View style={styles.inlineRow}>
                <AppText variant="footnote" tone="tertiary">
                  {keyStatus}
                </AppText>
                <AppText
                  variant="label"
                  tone="accent"
                  onPress={commitKey}
                  suppressHighlighting
                >
                  保存
                </AppText>
              </View>
              {apiKeyError ? (
                <AppText
                  variant="footnote"
                  tone="danger"
                  accessibilityLiveRegion="polite"
                >
                  {apiKeyError}
                </AppText>
              ) : null}
            </View>
            <Divider />
            <SettingsTextField
              label="Base URL"
              value={settings.baseUrl}
              keyboardType="url"
              onCommit={value => updateSettings({baseUrl: value})}
              description="默认 https://api.deepseek.com"
            />
            <Divider />
            <SettingsTextField
              label="模型"
              value={settings.model}
              onCommit={value => updateSettings({model: value})}
              description="推荐 deepseek-flash"
            />
            <View
              style={[
                styles.presets,
                {padding: theme.spacing.lg, gap: theme.spacing.sm},
              ]}
            >
              {MODEL_PRESETS.map(preset => (
                <Chip
                  key={preset.value}
                  label={preset.label}
                  size="sm"
                  active={settings.model === preset.value}
                  onPress={() => updateSettings({model: preset.value})}
                />
              ))}
            </View>
          </Section>

          <Section title="对话能力">
            <SwitchRow
              label="深度思考"
              description="先推理再回答，适合复杂问题"
              value={settings.thinking}
              onValueChange={value => updateSettings({thinking: value})}
            />
            <Divider />
            <ControlBlock label="推理强度">
              <SegmentedControl<ReasoningEffort>
                options={[
                  {label: '低', value: 'low'},
                  {label: '高', value: 'high'},
                  {label: '最高', value: 'max'},
                ]}
                value={settings.reasoningEffort}
                onChange={value => updateSettings({reasoningEffort: value})}
                disabled={!settings.thinking}
              />
            </ControlBlock>
            <Divider />
            <SwitchRow
              label="联网搜索"
              description="由服务端搜索并附带引用；开启深度思考时为深度搜索"
              value={settings.webSearch}
              onValueChange={value => updateSettings({webSearch: value})}
            />
            <Divider />
            <SwitchRow
              label="阅读链接"
              description="自动阅读消息中的网页链接"
              value={settings.readUrl}
              onValueChange={value => updateSettings({readUrl: value})}
            />
            <Divider />
            <ControlBlock label="内容安全">
              <SegmentedControl<SafetyLevel>
                options={[
                  {label: '基础风控', value: 'high'},
                  {label: 'API 默认', value: 'low'},
                ]}
                value={settings.safetyLevel}
                onChange={value => updateSettings({safetyLevel: value})}
              />
            </ControlBlock>
            <Divider />
            <SwitchRow
              label="自动生成标题"
              description="首轮对话后由模型生成简短标题"
              value={settings.autoTitle}
              onValueChange={value => updateSettings({autoTitle: value})}
            />
          </Section>

          <Section
            title="用户信息"
            footer="随每条消息以 latest_reminder 发送，帮助模型结合日期、语言与所在地回答。"
          >
            <ControlBlock label="语言">
              <SegmentedControl<'中文' | 'English'>
                options={[
                  {label: '中文', value: '中文'},
                  {label: 'English', value: 'English'},
                ]}
                value={settings.language}
                onChange={value => updateSettings({language: value})}
              />
            </ControlBlock>
            <Divider />
            <SettingsTextField
              label="所在地"
              value={settings.location}
              placeholder="例如：上海（可留空）"
              onCommit={value => saveTextSetting('location', value)}
              submitOnly
              description={
                web
                  ? '按回车保存。可以包含逗号，如“中国, 上海”。'
                  : '按键盘上的「完成」保存。可以包含逗号，如“中国, 上海”。'
              }
            />
          </Section>

          <Section
            title="附加提示词"
            footer="内置系统提示词始终随请求发送；这里的内容会追加在它后面，适合补充风格、领域或回答格式要求。"
          >
            <SettingsTextField
              label="附加内容"
              value={settings.systemPrompt}
              multiline
              placeholder="例如：回答时先给结论，再展开说明。"
              onCommit={value => saveTextSetting('systemPrompt', value)}
              submitOnly
              description={
                web
                  ? '按回车保存，Shift + 回车换行。'
                  : '按键盘上的「完成」保存，点「换行」插入新行。'
              }
            />
          </Section>

          <Section title="外观">
            <ControlBlock label="主题">
              <SegmentedControl<ThemeMode>
                options={[
                  {label: '跟随系统', value: 'system'},
                  {label: '浅色', value: 'light'},
                  {label: '深色', value: 'dark'},
                ]}
                value={settings.themeMode}
                onChange={value => updateSettings({themeMode: value})}
              />
            </ControlBlock>
          </Section>

          <Section title="数据">
            <ActionRow
              label={`清空全部对话（${conversationCount}）`}
              onPress={confirmClearAll}
              destructive
            />
            <Divider />
            <ActionRow label="恢复默认设置" onPress={confirmReset} />
          </Section>

          <Section title="关于">
            <SettingRow
              label="版本"
              right={
                <AppText variant="label" tone="secondary">
                  {APP_VERSION}
                </AppText>
              }
            />
            <Divider />
            <ActionRow label="DeepSeek Chatbot 构建指南" onPress={openDocs} />
            <Divider />
            <SettingRow
              label="数据存储"
              description="对话与设置保存在本机 AsyncStorage"
            />
          </Section>

          <AppText variant="footnote" tone="tertiary" align="center">
            MoreChat 基于 DeepSeek API 构建，模型输出仅供参考。
          </AppText>
        </ContentColumn>
      </ScrollView>
    </Screen>
  );
}

/** 标签 + 控件的组合块（分段控件、预设等）。 */
function ControlBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  block: {
    minHeight: 52,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
