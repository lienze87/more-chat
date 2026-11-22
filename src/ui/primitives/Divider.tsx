import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

export interface DividerProps {
  /** 左侧缩进，默认与行内文字对齐（16）。 */
  inset?: number;
}

/** 1px 分割线：所有列表 / 卡片内的分隔统一走这里。 */
export function Divider({inset = 0}: DividerProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: theme.colors.border,
          marginLeft: inset,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
  },
});
