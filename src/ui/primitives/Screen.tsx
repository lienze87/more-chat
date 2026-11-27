import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme/ThemeProvider';
import {layout} from '../theme/tokens';
import {AppText} from './AppText';
import {IconButton} from './IconButton';

export interface ScreenProps {
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

const DEFAULT_EDGES: NonNullable<ScreenProps['edges']> = ['top'];

/** 页面根容器：统一背景色与安全区。 */
export function Screen({children, edges = DEFAULT_EDGES}: ScreenProps) {
  const theme = useTheme();
  const {top} = useSafeAreaInsets();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, {backgroundColor: theme.colors.background}]}
    >
      {top > 0 && edges.includes('top') ? (
        <View
          pointerEvents="none"
          style={[
            styles.topInset,
            {height: top, backgroundColor: theme.colors.surface},
          ]}
        />
      ) : null}
      {children}
    </SafeAreaView>
  );
}

/** 内容列：移动端占满，桌面浏览器限制最大宽度并居中，保证可读性。 */
export function ContentColumn({
  children,
  style,
  maxWidth = layout.contentMaxWidth,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  maxWidth?: number;
}) {
  return (
    <View style={[{width: '100%', maxWidth, alignSelf: 'center'}, style]}>
      {children}
    </View>
  );
}

export interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  /** 左侧自定义槽位（例如品牌 Logo），与 `onBack` 二选一。 */
  leading?: React.ReactNode;
  /** 右侧操作槽位。 */
  trailing?: React.ReactNode;
}

/** 页面共用的头部：返回键、标题、右侧操作。 */
export function PageHeader({
  title,
  onBack,
  leading,
  trailing,
}: PageHeaderProps) {
  const theme = useTheme();
  const {colors, spacing} = theme;

  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: spacing.xs,
          paddingVertical: spacing.sm,
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View style={{width: theme.controlSize.touch}}>
        {onBack ? (
          <IconButton
            name="back"
            accessibilityLabel="返回"
            tone="primary"
            size="md"
            onPress={onBack}
          />
        ) : (
          leading
        )}
      </View>

      <View style={[styles.titleColumn, styles.titleCenter]}>
        <AppText variant="title" numberOfLines={1} style={styles.centerText}>
          {title}
        </AppText>
      </View>

      <View style={{width: theme.controlSize.touch}}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  topInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleColumn: {
    flex: 1,
    gap: 1,
  },
  titleCenter: {
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
});
