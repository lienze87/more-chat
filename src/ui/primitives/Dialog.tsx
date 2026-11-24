import React, {useEffect, useState} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {layout} from '../theme/tokens';
import {AppText} from './AppText';
import {Button} from './Button';
import {Divider} from './Divider';
import {Icon} from './Icon';
import {TextField} from './TextField';
import {webPointer} from './interaction';
import {
  useDialogStore,
  type DialogButton,
  type DialogRequest,
} from './dialogStore';

/**
 * 对话框宿主：在 AppRoot 内挂载一次，负责渲染 `showAlert` / `openActionMenu`
 * 排队的请求。按钮数量 > 2 时自动切换为纵向操作菜单。
 */
export function DialogHost() {
  const theme = useTheme();
  const current = useDialogStore(state => state.current);
  const dismiss = useDialogStore(state => state.dismiss);

  // Animated.Value 只创建一次；用 useState 惰性初始化，避免在渲染期读 ref。
  const [animation] = useState(() => new Animated.Value(0));
  // 关闭时保留最后一个请求，等滑出动画结束再卸载。
  const [rendered, setRendered] = useState(current !== null);
  const [visibleRequest, setVisibleRequest] = useState<DialogRequest | null>(
    current,
  );

  if (current && current !== visibleRequest) {
    setVisibleRequest(current);
    if (!rendered) {
      setRendered(true);
    }
  }

  useEffect(() => {
    if (current) {
      Animated.timing(animation, {
        toValue: 1,
        duration: 160,
        // react-native-web 没有原生动画模块，Web 端走 JS 驱动避免告警。
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      return;
    }
    if (!rendered) {
      return;
    }
    let active = true;
    Animated.timing(animation, {
      toValue: 0,
      duration: 140,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({finished}) => {
      if (active && finished) {
        setRendered(false);
        setVisibleRequest(null);
      }
    });
    return () => {
      active = false;
    };
  }, [animation, current, rendered]);

  const request = current ?? visibleRequest;

  if (!rendered || !request) {
    return null;
  }

  const cancelButton = request.buttons.find(
    button => button.style === 'cancel',
  );

  const closeWithCancel = () => {
    if (current) {
      dismiss(current.id, cancelButton);
    }
  };

  const handleBackdrop = () => {
    if (!current) {
      return;
    }
    if (cancelButton) {
      dismiss(current.id, cancelButton);
      return;
    }
    if (current.prompt) {
      dismiss(current.id);
      return;
    }
    if (current.buttons.length === 1) {
      dismiss(current.id, current.buttons[0]);
    }
  };

  const content = (
    <View style={[styles.backdrop, {backgroundColor: theme.colors.overlay}]}>
      {/*
        背景遮罩与卡片是兄弟节点而不是父子：点击卡片里的按钮时不会冒泡到
        遮罩上重复关闭对话框（react-native-web 的 Pressable 走 DOM 冒泡）。
      */}
      <Pressable
        style={styles.backdropPress}
        onPress={handleBackdrop}
        accessibilityRole="button"
        accessibilityLabel="关闭对话框"
      />
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.cardWrapper,
          {
            opacity: animation,
            transform: [
              {
                scale: animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.xl,
              maxWidth: layout.dialogMaxWidth,
            },
          ]}
        >
          <DialogBody
            request={request}
            onSelect={button => {
              if (current) {
                dismiss(current.id, button);
              }
            }}
            onClose={() => {
              if (current) {
                dismiss(current.id);
              }
            }}
          />
        </View>
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={closeWithCancel}
      statusBarTranslucent
    >
      {content}
    </Modal>
  );
}

function DialogBody({
  request,
  onSelect,
  onClose,
}: {
  request: DialogRequest;
  onSelect: (button: DialogButton) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const {colors, spacing} = theme;

  if (request.prompt) {
    return (
      <DialogPrompt key={request.id} request={request} onClose={onClose} />
    );
  }

  const isMenu = request.buttons.length > 2;
  const actions = request.buttons.filter(button => button.style !== 'cancel');
  const cancel = request.buttons.find(button => button.style === 'cancel');
  const tone =
    request.tone ?? (hasDestructive(request.buttons) ? 'danger' : 'info');

  return (
    <View>
      <View style={[styles.body, {padding: spacing.xl, gap: spacing.sm}]}>
        <View style={styles.titleRow}>
          {/* 只有确认类对话框需要警示图标，操作菜单保持轻量。 */}
          {tone === 'danger' && !isMenu ? (
            <Icon name="alert" size={theme.iconSize.xl} tone="danger" />
          ) : null}
          <AppText variant="title" style={styles.title}>
            {request.title}
          </AppText>
        </View>
        {request.message ? (
          <AppText variant="body" tone="secondary">
            {request.message}
          </AppText>
        ) : null}
      </View>

      {isMenu ? (
        <View>
          <Divider />
          {actions.map((button, index) => (
            <View key={`${button.text}-${index}`}>
              {index > 0 ? <Divider /> : null}
              <DialogRow button={button} onPress={() => onSelect(button)} />
            </View>
          ))}
          {cancel ? (
            <View>
              <Divider />
              <View
                style={{
                  height: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                }}
              />
              <Divider />
              <DialogRow button={cancel} onPress={() => onSelect(cancel)} />
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.buttonRow,
            {
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.lg,
              gap: spacing.sm,
            },
          ]}
        >
          {cancel ? (
            <View style={styles.flexButton}>
              <DialogButtonView
                button={cancel}
                onPress={() => onSelect(cancel)}
                variant="ghost"
              />
            </View>
          ) : null}
          {actions.map((button, index) => (
            <View key={`${button.text}-${index}`} style={styles.flexButton}>
              <DialogButtonView
                button={button}
                onPress={() => onSelect(button)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DialogRow({
  button,
  onPress,
}: {
  button: DialogButton;
  onPress: () => void;
}) {
  const theme = useTheme();
  const destructive = button.style === 'destructive';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={button.text}
      onPress={onPress}
      style={({pressed}) => [
        styles.menuRow,
        webPointer,
        {
          backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
          paddingVertical: theme.spacing.lg,
        },
      ]}
    >
      <AppText
        variant="body"
        align="center"
        style={{
          color: destructive ? theme.colors.danger : theme.colors.text,
          fontWeight: destructive ? '600' : '500',
        }}
      >
        {button.text}
      </AppText>
    </Pressable>
  );
}

function DialogButtonView({
  button,
  onPress,
  variant,
}: {
  button: DialogButton;
  onPress: () => void;
  variant?: 'ghost';
}) {
  const theme = useTheme();
  const destructive = button.style === 'destructive';
  const ghost = variant === 'ghost';
  const background = ghost
    ? 'transparent'
    : destructive
      ? theme.colors.danger
      : theme.colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={button.text}
      onPress={onPress}
      style={({pressed}) => [
        styles.dialogButton,
        webPointer,
        {
          backgroundColor: background,
          borderColor: theme.colors.border,
          borderWidth: ghost ? StyleSheet.hairlineWidth : 0,
          borderRadius: theme.radius.md,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <AppText
        variant="body"
        style={{
          color: ghost ? theme.colors.textSecondary : theme.colors.onAccent,
          fontWeight: '600',
        }}
      >
        {button.text}
      </AppText>
    </Pressable>
  );
}

function hasDestructive(buttons: DialogButton[]): boolean {
  return buttons.some(button => button.style === 'destructive');
}

/** 单行文本输入弹窗：复用对话框队列与卡片样式。 */
function DialogPrompt({
  request,
  onClose,
}: {
  request: DialogRequest;
  onClose: () => void;
}) {
  const theme = useTheme();
  const {spacing} = theme;
  const prompt = request.prompt;
  const [value, setValue] = useState(prompt?.initialValue ?? '');

  if (!prompt) {
    return null;
  }

  const submit = () => {
    const next = value.trim();
    if (!next) {
      return;
    }
    prompt.onSubmit(next);
    onClose();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.promptKav}
    >
      <View style={{padding: spacing.xl, gap: spacing.md}}>
        <AppText variant="title">{request.title}</AppText>
        {request.message ? (
          <AppText variant="body" tone="secondary">
            {request.message}
          </AppText>
        ) : null}
        <TextField
          label={prompt.label ?? '内容'}
          value={value}
          onChangeText={setValue}
          placeholder={prompt.placeholder}
          maxLength={prompt.maxLength}
          autoFocus
          onSubmitEditing={submit}
        />
        <View style={[styles.buttonRow, {gap: spacing.sm}]}>
          <View style={styles.flexButton}>
            <Button
              label={prompt.cancelText ?? '取消'}
              variant="secondary"
              onPress={onClose}
              fullWidth
            />
          </View>
          <View style={styles.flexButton}>
            <Button
              label={prompt.submitText ?? '保存'}
              onPress={submit}
              disabled={value.trim().length === 0}
              fullWidth
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdropPress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: layout.dialogMaxWidth,
  },
  card: {
    width: '100%',
    overflow: 'hidden',
  },
  body: {
    alignItems: 'stretch',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
  },
  flexButton: {
    flex: 1,
  },
  promptKav: {
    width: '100%',
  },
  dialogButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  menuRow: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
