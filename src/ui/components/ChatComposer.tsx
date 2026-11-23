import React, {useState} from 'react';
import {Keyboard, Pressable, StyleSheet, TextInput, View} from 'react-native';
import {MAX_INPUT_LENGTH} from '../../config/appConfig';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';
import type {IconName} from '../primitives/Icon';

interface ChatComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  bottomInset: number;
}

/**
 * 输入区：多行输入 + 发送/停止。
 *
 * 深度思考、联网搜索等能力统一由设置页的全局配置控制，输入区不再提供开关。
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  streaming,
  bottomInset,
}: ChatComposerProps) {
  const theme = useTheme();
  const {colors, radius, spacing} = theme;
  const canSend = value.trim().length > 0 && !streaming;

  // 输入框默认一行；内容变多时按实测内容高度撑开，最多显示五行后内部滚动。
  const lineHeight = theme.typography.body.lineHeight;
  const inputPadding = spacing.sm;
  const minInputHeight = lineHeight + inputPadding * 2;
  const maxInputHeight = lineHeight * 5 + inputPadding * 2;
  const [inputHeight, setInputHeight] = useState(minInputHeight);
  // 清空输入（发送后或手动删除）时立即回到一行，不等下一次内容测量。
  const resolvedInputHeight = value.length === 0 ? minInputHeight : inputHeight;

  const sendState = streaming ? 'stop' : canSend ? 'send' : 'idle';
  const sendBackground =
    sendState === 'stop'
      ? colors.danger
      : sendState === 'send'
        ? colors.accent
        : colors.borderStrong;
  const sendIcon: IconName = streaming ? 'stop' : 'send';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: Math.max(bottomInset, spacing.sm),
          gap: spacing.sm,
        },
      ]}
    >
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            borderRadius: radius.xxl,
            paddingLeft: spacing.lg,
            paddingRight: spacing.xs,
            paddingVertical: spacing.xs,
            gap: spacing.sm,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={next => {
            if (next.length === 0) {
              setInputHeight(minInputHeight);
            }
            onChangeText(next);
          }}
          onContentSizeChange={event => {
            const nextHeight = Math.min(
              maxInputHeight,
              Math.max(minInputHeight, event.nativeEvent.contentSize.height),
            );
            setInputHeight(previous =>
              Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight,
            );
          }}
          placeholder="给 MoreChat 发送消息…"
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={MAX_INPUT_LENGTH}
          accessibilityLabel="消息输入框"
          textAlignVertical="top"
          style={[
            styles.input,
            theme.typography.body,
            {
              color: colors.text,
              height: resolvedInputHeight,
              minHeight: minInputHeight,
              maxHeight: maxInputHeight,
              paddingVertical: inputPadding,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={streaming ? '停止生成' : '发送消息'}
          accessibilityState={{disabled: !streaming && !canSend}}
          onPress={() => {
            if (streaming) {
              onStop();
              return;
            }
            if (!canSend) {
              return;
            }
            Keyboard.dismiss();
            onSend();
          }}
          style={({pressed}) => [
            styles.sendButton,
            webPointer,
            {
              backgroundColor: sendBackground,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Icon
            name={sendIcon}
            size={theme.iconSize.md}
            color={colors.onAccent}
          />
        </Pressable>
      </View>

      <AppText variant="caption" tone="tertiary" align="center">
        内容由 AI 生成，请仔细甄别
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
