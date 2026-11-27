import React, {useState} from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {MAX_INPUT_LENGTH} from '../../config/appConfig';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';
import {Button} from '../primitives/Button';
import {Icon} from '../primitives/Icon';
import {webPointer} from '../primitives/interaction';
import type {IconName} from '../primitives/Icon';

interface ChatComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onJumpToLatest?: () => void;
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
  onJumpToLatest,
  streaming,
  bottomInset,
}: ChatComposerProps) {
  const theme = useTheme();
  const {colors, radius, spacing} = theme;
  const {fontScale, height} = useWindowDimensions();
  const canSend = value.trim().length > 0 && !streaming;
  const nativeInputSizing = Platform.OS === 'ios';

  // 输入框默认一行；内容变多时按实测内容高度撑开，最多显示五行后内部滚动。
  const lineHeight = Math.ceil(theme.typography.body.lineHeight * fontScale);
  const inputPadding = spacing.sm;
  const minInputHeight = lineHeight + inputPadding * 2;
  const maxInputHeight = Math.max(
    minInputHeight,
    Math.min(lineHeight * 5 + inputPadding * 2, height / 4),
  );
  const [inputHeight, setInputHeight] = useState(minInputHeight);
  // 清空输入（发送后或手动删除）时立即回到一行，不等下一次内容测量。
  const resolvedInputHeight =
    value.length === 0
      ? minInputHeight
      : Math.min(maxInputHeight, Math.max(minInputHeight, inputHeight));

  const sendState = streaming ? 'stop' : canSend ? 'send' : 'idle';
  const disabled = sendState === 'idle';
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
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: Math.max(bottomInset, spacing.sm),
          gap: spacing.sm,
        },
      ]}
    >
      {onJumpToLatest ? (
        <Button
          label="回到最新"
          icon="chevronDown"
          variant="secondary"
          onPress={onJumpToLatest}
          // iOS 列表滚动期间可能取消 press，固定区内的跳转在触碰时即可执行。
          onTouchStart={Platform.OS === 'ios' ? onJumpToLatest : undefined}
          style={{alignSelf: 'center'}}
        />
      ) : null}
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
          onLayout={
            nativeInputSizing
              ? event => setInputHeight(event.nativeEvent.layout.height)
              : undefined
          }
          onContentSizeChange={
            nativeInputSizing
              ? undefined
              : event => {
                  const nextHeight = Math.round(
                    event.nativeEvent.contentSize.height,
                  );
                  setInputHeight(nextHeight);
                }
          }
          placeholder="给 MoreChat 发送消息…"
          placeholderTextColor={colors.textSecondary}
          multiline
          scrollEnabled={
            !nativeInputSizing || inputHeight >= maxInputHeight - 0.5
          }
          maxLength={MAX_INPUT_LENGTH}
          accessibilityLabel="消息输入框"
          textAlignVertical="top"
          style={[
            styles.input,
            theme.typography.body,
            {
              color: colors.text,
              fontSize:
                Platform.OS === 'web'
                  ? Math.max(16, theme.typography.body.fontSize)
                  : theme.typography.body.fontSize,
              height: nativeInputSizing ? undefined : resolvedInputHeight,
              minHeight: minInputHeight,
              maxHeight: maxInputHeight,
              paddingVertical: inputPadding,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={streaming ? '停止生成' : '发送消息'}
          accessibilityState={{disabled}}
          disabled={disabled}
          onPress={() => {
            if (streaming) {
              onStop();
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
              width: theme.controlSize.touch,
              height: theme.controlSize.touch,
              borderRadius: radius.pill,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});
