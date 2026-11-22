import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {AppText} from '../primitives/AppText';

export interface LogoProps {
  size?: number;
}

/**
 * 品牌标记：圆角方块 + 尾巴，形状与 App 图标一致。
 *
 * 纯 View 绘制，不依赖图片资源，浅色 / 深色下都使用主题强调色。
 */
export function Logo({size = 44}: LogoProps) {
  const theme = useTheme();
  const tail = size * 0.28;

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: theme.colors.accent,
        },
      ]}
    >
      <View
        style={[
          styles.tail,
          {
            width: tail,
            height: tail,
            backgroundColor: theme.colors.accent,
            bottom: -tail * 0.28,
            left: size * 0.2,
            borderRadius: size * 0.04,
          },
        ]}
      />
      <AppText
        allowFontScaling={false}
        style={{
          color: theme.colors.onAccent,
          fontSize: size * 0.52,
          lineHeight: size * 0.64,
          fontWeight: '700',
          letterSpacing: -0.5,
        }}
      >
        M
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tail: {
    position: 'absolute',
    transform: [{rotate: '45deg'}],
  },
});
