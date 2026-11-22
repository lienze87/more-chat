import React, {useEffect, useState} from 'react';
import {Animated, Platform, StyleSheet} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

export interface ToggleProps {
  value: boolean;
}

/**
 * 开关的视觉部分。
 *
 * 不用 RN 的 `Switch`：`react-native-web` 的 Switch 由原生 checkbox 模拟，深色
 * 主题与自定义强调色无法完全生效（激活态滑块会退回默认青色）。自绘轨道 +
 * 滑块后，浅色 / 深色 / Web / Android 表现一致。交互由整行 `ListRow` 承担。
 */
export function Toggle({value}: ToggleProps) {
  const theme = useTheme();
  const {colors} = theme;
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [progress, value]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderStrong, colors.accent],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK_WIDTH - THUMB_SIZE - TRACK_PADDING * 2],
  });

  return (
    <Animated.View
      style={[
        styles.track,
        {
          backgroundColor: trackColor,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: colors.surface,
            transform: [{translateX}],
          },
        ]}
      />
    </Animated.View>
  );
}

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 22;
const TRACK_PADDING = 3;

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: TRACK_PADDING,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
