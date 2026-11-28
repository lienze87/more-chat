import React, {useState} from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {MAX_INPUT_LENGTH} from '../../config/appConfig';
import {useTheme} from '../theme/ThemeProvider';
import {Button} from '../primitives/Button';

interface ChatComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  bottomInset: number;
}

/**
 * 输入区：多行输入 + 独立的发送/停止按钮。
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
  const {fontScale, height} = useWindowDimensions();
  const canSend = value.trim().length > 0 && !streaming;
  const nativeInputSizing = Platform.OS === 'ios';
  const inputFontSize =
    Platform.OS === 'web'
      ? Math.max(16, theme.typography.body.fontSize)
      : theme.typography.body.fontSize;

  // 输入框默认一行；内容变多时按实测内容高度撑开，最多显示五行后内部滚动。
  const lineHeight = Math.ceil(theme.typography.body.lineHeight * fontScale);
  const inputPadding = spacing.sm;
  const minInputHeight = lineHeight + inputPadding * 2;
  const maxInputHeight = Math.max(
    minInputHeight,
    Math.min(lineHeight * 5 + inputPadding * 2, height / 4),
  );
  const [inputHeight, setInputHeight] = useState(minInputHeight);
  // Android 的 onContentSizeChange 只在视图重新布局时触发，文字换行而视图高度不变时
  // 不会上报；这里用同宽度的隐藏 Text 量出文本高度，再据此设置输入框高度。
  const [inputWidth, setInputWidth] = useState(0);
  const [textHeight, setTextHeight] = useState(lineHeight);
  // 清空输入（发送后或手动删除）时立即回到一行，不等下一次内容测量。
  const resolvedInputHeight =
    value.length === 0
      ? minInputHeight
      : Math.min(
          maxInputHeight,
          Math.max(
            minInputHeight,
            nativeInputSizing ? inputHeight : textHeight + inputPadding * 2,
          ),
        );

  const disabled = !streaming && !canSend;

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
        },
      ]}
    >
      <View style={[styles.row, {gap: spacing.sm}]}>
        <View
          style={[
            styles.inputShell,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.xxl,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          <TextInput
            value={value}
            onChangeText={next => {
              if (next.length === 0) {
                setTextHeight(lineHeight);
              }
              onChangeText(next);
            }}
            onLayout={event => {
              if (nativeInputSizing) {
                setInputHeight(event.nativeEvent.layout.height);
              } else {
                setInputWidth(event.nativeEvent.layout.width);
              }
            }}
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
                fontSize: inputFontSize,
                height: nativeInputSizing ? undefined : resolvedInputHeight,
                minHeight: minInputHeight,
                maxHeight: maxInputHeight,
                paddingVertical: inputPadding,
              },
            ]}
          />
          {!nativeInputSizing && inputWidth > 0 ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              aria-hidden
              style={[styles.measure, {width: inputWidth}]}
            >
              <Text
                numberOfLines={5}
                onLayout={event =>
                  setTextHeight(Math.round(event.nativeEvent.layout.height))
                }
                style={[
                  theme.typography.body,
                  {fontSize: inputFontSize, lineHeight},
                ]}
              >
                {value || ' '}
              </Text>
            </View>
          ) : null}
        </View>
        <Button
          label={streaming ? '停止' : '发送'}
          variant={streaming ? 'dangerSoft' : 'primary'}
          accessibilityLabel={streaming ? '停止生成' : '发送消息'}
          disabled={disabled}
          onPress={() => {
            if (streaming) {
              onStop();
              return;
            }
            Keyboard.dismiss();
            onSend();
          }}
          style={styles.sendButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  inputShell: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    alignSelf: 'stretch',
  },
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
  sendButton: {
    alignSelf: 'flex-end',
  },
});
