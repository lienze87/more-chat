import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
  retryFailedReply,
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
const BOTTOM_TOLERANCE = 12;

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
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => Platform.OS !== 'web' && Keyboard.isVisible(),
  );
  const [webKeyboardInset, setWebKeyboardInset] = useState(0);
  const [following, setFollowing] = useState(true);

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
  const lastOffset = useRef(0);
  const userScrolling = useRef(false);

  const isStreaming = streaming?.conversationId === conversation?.id;
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    if (Platform.OS === 'web') {
      const viewport = window.visualViewport;
      if (!viewport) {
        return;
      }
      const update = () => {
        const inputFocused =
          document.activeElement instanceof HTMLTextAreaElement;
        setWebKeyboardInset(
          inputFocused && viewport.scale === 1
            ? Math.max(
                0,
                window.innerHeight - viewport.height - viewport.offsetTop,
              )
            : 0,
        );
      };
      const reset = () => setWebKeyboardInset(0);
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
      document.addEventListener('focusout', reset);
      return () => {
        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
        document.removeEventListener('focusout', reset);
      };
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
      listRef.current?.getNativeScrollRef()?.scrollToEnd({animated: false});
    }
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
    const distance =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const movingUp = contentOffset.y < lastOffset.current;
    lastOffset.current = contentOffset.y;
    if (distance <= BOTTOM_TOLERANCE && !autoScroll.current) {
      autoScroll.current = true;
      setFollowing(true);
    } else if (
      distance > BOTTOM_TOLERANCE &&
      movingUp &&
      autoScroll.current &&
      (userScrolling.current || Platform.OS === 'web')
    ) {
      autoScroll.current = false;
      setFollowing(false);
    }
  };

  const resumeFollowing = useCallback(() => {
    userScrolling.current = false;
    autoScroll.current = true;
    setFollowing(true);
    scrollToBottom();
  }, [scrollToBottom]);

  const resetFollowing = useCallback(() => {
    userScrolling.current = false;
    autoScroll.current = true;
    lastOffset.current = 0;
    setFollowing(true);
  }, []);

  const promptForApiKey = useCallback(() => {
    showAlert('需要 API Key', '请先在设置中填写 DeepSeek API Key。', [
      {text: '去设置', onPress: () => navigation.navigate('Settings')},
      {text: '取消', style: 'cancel'},
    ]);
  }, [navigation]);

  const selectConversation = useCallback(
    (conversationId: string) => {
      Keyboard.dismiss();
      setDrawerVisible(false);
      setInput('');
      resetFollowing();
      setActiveId(conversationId);
    },
    [resetFollowing],
  );

  const startNewConversation = useCallback(() => {
    Keyboard.dismiss();
    setDrawerVisible(false);
    setInput('');
    resetFollowing();
    // 当前已经是空白新对话时直接复用，避免堆积多个“新对话”。
    if (conversation && conversation.messages.length === 0) {
      return;
    }
    setActiveId(createConversation().id);
  }, [conversation, createConversation, resetFollowing]);

  const removeConversation = useCallback(
    (conversationId: string) => {
      deleteConversation(conversationId);
      if (conversationId !== activeId) {
        return;
      }
      const remaining = useChatStore.getState().conversations;
      const next = sortConversationsByRecency(remaining)[0];
      setInput('');
      resetFollowing();
      setActiveId(next ? next.id : createConversation().id);
    },
    [activeId, createConversation, resetFollowing],
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
      resumeFollowing();
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
    [
      apiKey,
      conversation,
      input,
      isStreaming,
      promptForApiKey,
      resumeFollowing,
    ],
  );

  const retryReply = useCallback(
    (messageId: string, retry: boolean) => {
      if (!conversation) {
        return;
      }
      const run = () =>
        (retry ? retryFailedReply : regenerateFrom)(
          conversation.id,
          messageId,
        ).catch(error => {
          if (error instanceof MissingApiKeyError) {
            promptForApiKey();
          } else {
            showAlert(
              retry ? '重试失败' : '重新生成失败',
              describeError(error),
            );
          }
        });
      if (!retry && conversation.messages.at(-1)?.id !== messageId) {
        showAlert('重新生成回答', '重新生成会替换这条回复并删除之后的消息。', [
          {text: '取消', style: 'cancel'},
          {text: '重新生成', style: 'destructive', onPress: run},
        ]);
        return;
      }
      void run();
    },
    [conversation, promptForApiKey],
  );

  const header = (
    <PageHeader
      title={conversation?.title ?? 'MoreChat'}
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
          name="extensions"
          tone="primary"
          size="md"
          iconSize={20}
          accessibilityLabel="打开扩展管理"
          onPress={() => navigation.navigate('Extensions')}
        />
      }
    />
  );
  const drawer = (
    <ConversationDrawer
      visible={drawerVisible}
      activeId={conversation?.id ?? null}
      onClose={() => setDrawerVisible(false)}
      onSelect={selectConversation}
      onNewConversation={startNewConversation}
      onDelete={removeConversation}
      onRename={renameConversation}
      onClearMessages={clearMessages}
      onOpenFiles={() => {
        setDrawerVisible(false);
        navigation.navigate('Files');
      }}
      onOpenSettings={openSettings}
    />
  );

  if (!conversation) {
    return (
      <Screen edges={['top']}>
        {header}
        <View style={styles.emptyWrap}>
          <EmptyState
            artwork={<Logo size={44} />}
            title="还没有对话"
            description="打开左侧菜单，选择「新建对话」。"
          />
        </View>
        {drawer}
      </Screen>
    );
  }

  const showWelcome = messages.length === 0;

  return (
    <Screen edges={['top']}>
      {header}

      {/*
        键盘避让：Android 新版 edge-to-edge 下 `adjustResize` 不再缩小窗口，
        键盘会直接盖住输入框；两端统一用 padding 把内容顶上去。
      */}
      <KeyboardAvoidingView
        style={[
          styles.flex,
          Platform.OS === 'web' && {paddingBottom: webKeyboardInset},
        ]}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ContentColumn style={styles.flex}>
          <FlatList
            key={conversation.id}
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            style={styles.flex}
            contentContainerStyle={[
              {
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.lg,
                paddingBottom: theme.spacing.md,
              },
              showWelcome ? styles.listContentWelcome : null,
            ]}
            ListEmptyComponent={<ChatWelcome onSuggestion={submit} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
            onScroll={handleScroll}
            onScrollBeginDrag={() => {
              userScrolling.current = true;
            }}
            onMomentumScrollEnd={() => {
              userScrolling.current = false;
            }}
            scrollEventThrottle={16}
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
                    onRegenerate={() =>
                      retryReply(item.id, item.status === 'error')
                    }
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
            onJumpToLatest={
              !following && !showWelcome ? resumeFollowing : undefined
            }
            streaming={isStreaming}
            bottomInset={
              keyboardVisible || webKeyboardInset > 0 ? 0 : insets.bottom
            }
          />
        </ContentColumn>
      </KeyboardAvoidingView>

      {drawer}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
