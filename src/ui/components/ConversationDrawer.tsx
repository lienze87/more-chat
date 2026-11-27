import React, {useEffect, useMemo, useState} from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CHAT_LIMITS} from '../../config/appConfig';
import type {Conversation} from '../../domain/chat/types';
import {
  useChatStore,
  sortConversationsByRecency,
} from '../../features/chat/chatStore';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {Divider} from '../primitives/Divider';
import {openActionMenu, openPrompt} from '../primitives/dialogStore';
import {Icon} from '../primitives/Icon';
import {IconButton} from '../primitives/IconButton';
import {webPointer} from '../primitives/interaction';
import {useTheme} from '../theme/ThemeProvider';
import {ConversationRow} from './ConversationRow';
import {Logo} from './Logo';

interface ConversationDrawerProps {
  visible: boolean;
  activeId: string | null;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => void;
  onClearMessages: (conversationId: string) => void;
  onOpenFiles: () => void;
  onOpenSettings: () => void;
}

/**
 * 首页左侧抽屉：新建对话、对话列表，以及底部的文件与设置入口。
 *
 * 不使用 `Modal`：抽屉需要在应用内层级里，这样全局对话框与重命名弹窗
 * 天然盖在它上面，也避免原生多 Modal 叠加时的展示顺序问题。
 */
export function ConversationDrawer({
  visible,
  activeId,
  onClose,
  onSelect,
  onNewConversation,
  onDelete,
  onRename,
  onClearMessages,
  onOpenFiles,
  onOpenSettings,
}: ConversationDrawerProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const panelWidth = Math.min(width * 0.86, 360);

  const conversations = useChatStore(state => state.conversations);
  const sorted = useMemo(
    () => sortConversationsByRecency(conversations),
    [conversations],
  );

  const [animation] = useState(() => new Animated.Value(0));
  const [rendered, setRendered] = useState(visible);

  // 打开时立即挂载，关闭时等滑出动画结束再卸载（动画回调里 setState 是允许的）。
  if (visible && !rendered) {
    setRendered(true);
  }

  useEffect(() => {
    if (!visible) {
      Animated.timing(animation, {
        toValue: 0,
        duration: 160,
        useNativeDriver: Platform.OS !== 'web',
      }).start(({finished}) => {
        if (finished) {
          setRendered(false);
        }
      });
      return;
    }
    animation.setValue(0);
    Animated.timing(animation, {
      toValue: 1,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [animation, visible]);

  const openConversationMenu = (conversation: Conversation) => {
    openActionMenu(conversation.title, [
      {
        text: '重命名',
        onPress: () =>
          openPrompt({
            title: '重命名对话',
            prompt: {
              label: '对话标题',
              initialValue: conversation.title,
              placeholder: '输入对话标题',
              maxLength: CHAT_LIMITS.maxTitleInputLength,
              onSubmit: value => onRename(conversation.id, value),
            },
          }),
      },
      {
        text: '清空消息',
        onPress: () =>
          openActionMenu(
            '清空消息',
            [
              {
                text: '清空',
                style: 'destructive',
                onPress: () => onClearMessages(conversation.id),
              },
            ],
            {
              message: `将清空「${conversation.title}」的全部消息，无法恢复。`,
              tone: 'danger',
            },
          ),
      },
      {
        text: '删除对话',
        style: 'destructive',
        onPress: () =>
          openActionMenu(
            '删除对话',
            [
              {
                text: '删除',
                style: 'destructive',
                onPress: () => onDelete(conversation.id),
              },
            ],
            {
              message: `将永久删除「${conversation.title}」，无法恢复。`,
              tone: 'danger',
            },
          ),
      },
    ]);
  };

  if (!rendered) {
    return null;
  }

  const content = (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor: colors.overlay, opacity: animation},
        ]}
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        focusable={false}
        tabIndex={-1}
        onPress={onClose}
      />
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.panel,
          {
            width: panelWidth,
            backgroundColor: colors.surface,
            borderTopRightRadius: theme.radius.xl,
            borderBottomRightRadius: theme.radius.xl,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [
              {
                translateX: animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-panelWidth, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.brand,
            {
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              gap: spacing.md,
            },
          ]}
        >
          <Logo size={32} />
          <View style={styles.brandText}>
            <AppText variant="title">MoreChat</AppText>
            <AppText variant="caption" tone="tertiary">
              {sorted.length} 个对话
            </AppText>
          </View>
          <IconButton
            name="close"
            accessibilityLabel="关闭对话列表"
            onPress={onClose}
          />
        </View>

        <Button
          label="新建对话"
          icon="plus"
          variant="soft"
          fullWidth
          onPress={onNewConversation}
          style={{marginHorizontal: spacing.lg, marginBottom: spacing.md}}
        />
        <Divider />

        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          style={styles.flex}
          contentContainerStyle={[
            styles.listContent,
            {paddingVertical: spacing.sm},
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{padding: spacing.xxl}}>
              <AppText variant="footnote" tone="tertiary" align="center">
                还没有对话
              </AppText>
            </View>
          }
          renderItem={({item}) => (
            <ConversationRow
              conversation={item}
              active={item.id === activeId}
              onPress={() => onSelect(item.id)}
              onOpenMenu={() => openConversationMenu(item)}
            />
          )}
        />

        <Divider />

        {(
          [
            {label: '文件', icon: 'folder', onPress: onOpenFiles},
            {label: '设置', icon: 'settings', onPress: onOpenSettings},
          ] as const
        ).map(({label, icon, onPress}) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`打开${label}`}
            onPress={onPress}
            style={({pressed}) => [
              styles.footerRow,
              webPointer,
              {
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
              },
            ]}
          >
            <Icon name={icon} size={theme.iconSize.lg} tone="secondary" />
            <AppText variant="body" style={styles.footerLabel}>
              {label}
            </AppText>
            <Icon
              name="chevronRight"
              size={theme.iconSize.sm}
              tone="tertiary"
            />
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );

  return Platform.OS === 'web' ? (
    <Modal visible transparent onRequestClose={onClose}>
      {content}
    </Modal>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    flex: 1,
    gap: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    flex: 1,
  },
});
