import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../app/navigation/types';
import type {ChatMessage} from '../../domain/chat/types';
import {
  clearMessages,
  deleteConversation,
  regenerateFrom,
  sendMessage,
  stopStreaming,
} from '../../features/chat/chatEngine';
import {
  latestConversationId,
  sortConversationsByRecency,
  useChatStore,
} from '../../features/chat/chatStore';
import {useSettingsStore} from '../../features/settings/settingsStore';
import {MissingApiKeyError, describeError} from '../../adapters/api/errors';
import {showAlert} from '../primitives/dialogStore';
import {AssistantMessageView} from '../components/AssistantMessageView';
import {ChatComposer} from '../components/ChatComposer';
import {ConversationDrawer} from '../components/ConversationDrawer';
import {ChatWelcome} from '../components/ChatWelcome';
import {Logo} from '../components/Logo';
import {AppText} from '../primitives/AppText';
import {Card} from '../primitives/Card';
import {EmptyState} from '../primitives/EmptyState';
import {Icon} from '../primitives/Icon';
import {IconButton} from '../primitives/IconButton';
import {ContentColumn, PageHeader, Screen} from '../primitives/Screen';
import {useTheme} from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

/**
 * 首页：当前对话的消息流 + 输入区。
 *
 * 对话列表收进左侧抽屉，页面本身始终停留在某一段对话上；启动后的首个
 * 对话由 `ensureLaunchConversation` 在 hydration 之后准备好。
 */
export function ChatScreen({navigation}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [activeId, setActiveId] = useState<string | null>(
    () => latestConversationId() ?? null,
  );
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [input, setInput] = useState('');

  // 选中对话被删除（例如设置页清空全部）时自动回退到最近一段对话。
  const conversation = useChatStore(
    state =>
      state.conversations.find(item => item.id === activeId) ??
      state.conversations[0],
  );
  const streaming = useChatStore(state => state.streaming);
  const createConversation = useChatStore(state => state.createConversation);
  const renameConversation = useChatStore(state => state.renameConversation);

  const apiKey = useSettingsStore(state => state.apiKey);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoScroll = useRef(true);

  const isStreaming = streaming?.conversationId === conversation?.id;
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    if (!drawerVisible) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setDrawerVisible(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [drawerVisible]);

  const scrollToBottom = useCallback(() => {
    if (autoScroll.current) {
      listRef.current?.scrollToEnd({animated: false});
    }
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
    const distance =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    autoScroll.current = distance < 160;
  };

  const promptForApiKey = useCallback(() => {
    showAlert('需要 API Key', '请先在设置中填写 DeepSeek API Key。', [
      {text: '去设置', onPress: () => navigation.navigate('Settings')},
      {text: '取消', style: 'cancel'},
    ]);
  }, [navigation]);

  const selectConversation = useCallback((conversationId: string) => {
    Keyboard.dismiss();
    setDrawerVisible(false);
    setInput('');
    autoScroll.current = true;
    setActiveId(conversationId);
  }, []);

  const startNewConversation = useCallback(() => {
    Keyboard.dismiss();
    setDrawerVisible(false);
    setInput('');
    autoScroll.current = true;
    // 当前已经是空白新对话时直接复用，避免堆积多个“新对话”。
    if (conversation && conversation.messages.length === 0) {
      return;
    }
    setActiveId(createConversation().id);
  }, [conversation, createConversation]);

  const removeConversation = useCallback(
    (conversationId: string) => {
      deleteConversation(conversationId);
      if (conversationId !== activeId) {
        return;
      }
      const remaining = useChatStore.getState().conversations;
      const next = sortConversationsByRecency(remaining)[0];
      setInput('');
      autoScroll.current = true;
      setActiveId(next ? next.id : createConversation().id);
    },
    [activeId, createConversation],
  );

  const openSettings = useCallback(() => {
    setDrawerVisible(false);
    navigation.navigate('Settings');
  }, [navigation]);

  const submit = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || !conversation || isStreaming) {
        return;
      }
      // 另一个对话还在流式生成时，chatEngine 会拒绝新请求，这里提前给出提示。
      const running = useChatStore.getState().streaming;
      if (running && running.conversationId !== conversation.id) {
        showAlert('正在生成回答', '另一个对话仍在生成，请先停止再发送。');
        return;
      }
      if (!apiKey.trim()) {
        promptForApiKey();
        return;
      }
      const conversationId = conversation.id;
      setInput('');
      autoScroll.current = true;
      try {
        await sendMessage(conversationId, text);
      } catch (error) {
        setInput(text);
        if (error instanceof MissingApiKeyError) {
          promptForApiKey();
        } else {
          showAlert('发送失败', describeError(error));
        }
      }
    },
    [apiKey, conversation, input, isStreaming, promptForApiKey],
  );

  const regenerate = useCallback(
    (messageId: string) => {
      if (!conversation) {
        return;
      }
      // 从这条回复开始重写：它之后的轮次会被丢弃，与「重新生成」的语义一致。
      regenerateFrom(conversation.id, messageId).catch(error => {
        if (error instanceof MissingApiKeyError) {
          promptForApiKey();
        } else {
          showAlert('重新生成失败', describeError(error));
        }
      });
    },
    [conversation, promptForApiKey],
  );

  // 极端情况（设置页“清空全部对话”）下兜底，给出新建入口。
  if (!conversation) {
    return (
      <Screen edges={['top']}>
        <PageHeader title="MoreChat" />
        <View style={styles.emptyWrap}>
          <EmptyState
            artwork={<Logo size={44} />}
            title="还没有对话"
            description="点击下方按钮，开始你的第一段对话。"
            action={{label: '新建对话', onPress: startNewConversation}}
          />
        </View>
      </Screen>
    );
  }

  const showWelcome = messages.length === 0;

  return (
    <Screen edges={['top']}>
      <PageHeader
        title={conversation.title}
        leading={
          <IconButton
            name="menu"
            tone="primary"
            size="md"
            iconSize={20}
            accessibilityLabel="打开对话列表"
            onPress={() => {
              Keyboard.dismiss();
              setDrawerVisible(true);
            }}
          />
        }
        trailing={
          <IconButton
            name="plus"
            tone="primary"
            size="md"
            iconSize={20}
            accessibilityLabel="新建对话"
            onPress={startNewConversation}
          />
        }
      />

      {/*
        键盘避让：Android 新版 edge-to-edge 下 `adjustResize` 不再缩小窗口，
        键盘会直接盖住输入框；两端统一用 padding 把内容顶上去。
      */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ContentColumn style={styles.flex}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            style={styles.flex}
            contentContainerStyle={[
              styles.listContent,
              showWelcome ? styles.listContentWelcome : null,
            ]}
            ListEmptyComponent={<ChatWelcome onSuggestion={submit} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={scrollToBottom}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => {
              if (item.role === 'user') {
                return (
                  <View style={styles.userRow}>
                    <View
                      style={[
                        styles.userBubble,
                        {
                          backgroundColor: theme.colors.userBubble,
                          borderRadius: theme.radius.lg,
                          borderBottomRightRadius: theme.radius.xs,
                          paddingHorizontal: theme.spacing.lg,
                          paddingVertical: theme.spacing.md,
                        },
                      ]}
                    >
                      <AppText tone="userBubble">{item.content}</AppText>
                    </View>
                  </View>
                );
              }
              return (
                <View style={styles.assistantRow}>
                  <AssistantMessageView
                    message={item}
                    isStreaming={
                      isStreaming && item.id === streaming?.messageId
                    }
                    onRegenerate={() => regenerate(item.id)}
                  />
                </View>
              );
            }}
          />
        </ContentColumn>

        {!apiKey.trim() ? (
          <ContentColumn>
            <Card
              variant="accent"
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel="前往设置填写 API Key"
              style={[
                styles.banner,
                {
                  marginHorizontal: theme.spacing.lg,
                  marginBottom: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  gap: theme.spacing.sm,
                },
              ]}
            >
              <Icon name="key" size={theme.iconSize.sm} tone="accent" />
              <AppText
                variant="footnote"
                tone="accent"
                style={styles.bannerText}
              >
                尚未配置 API Key，点击前往设置
              </AppText>
              <Icon
                name="chevronRight"
                size={theme.iconSize.sm}
                tone="accent"
              />
            </Card>
          </ContentColumn>
        ) : null}

        <ContentColumn>
          <ChatComposer
            value={input}
            onChangeText={setInput}
            onSend={() => submit()}
            onStop={stopStreaming}
            streaming={isStreaming}
            bottomInset={insets.bottom}
          />
        </ContentColumn>
      </KeyboardAvoidingView>

      <ConversationDrawer
        visible={drawerVisible}
        activeId={conversation.id}
        onClose={() => setDrawerVisible(false)}
        onSelect={selectConversation}
        onDelete={removeConversation}
        onRename={renameConversation}
        onClearMessages={clearMessages}
        onOpenSettings={openSettings}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  listContentWelcome: {
    flexGrow: 1,
  },
  userRow: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  userBubble: {
    maxWidth: '86%',
  },
  assistantRow: {
    marginBottom: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerText: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
});
