# UI 设计系统

目标：首页（对话 + 左侧抽屉）与设置页在浅色、深色、移动端与桌面浏览器上使用
同一套间距、字号、圆角、图标与交互反馈；页面里不再出现「一次性的魔法数字」。

```text
theme/tokens.ts     设计令牌：颜色 / 间距 / 圆角 / 字号 / 图标尺寸 / 控件高度
theme/ThemeProvider 根据系统配色与设置生成主题对象，useTheme() 读取
primitives/         基础组件（按钮、卡片、输入框、对话框…），只依赖令牌
components/         业务组件，由基础组件拼装
screens/            页面，由组件 + 布局容器拼装
```

## 技术选型

| 领域 | 方案                             | 说明                                                                                           |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| 图标 | `@expo/vector-icons`（Ionicons） | Expo 官方图标库，无需额外原生模块，Expo Go / Web 均可用                                        |
| 组件 | 仓库内的 `src/ui/primitives`     | 没有引入重量级 UI Kit：项目已有完整主题与品牌色，第三方 Kit 会带来第二套主题系统与样式覆盖成本 |
| 字体 | 系统字体                         | 不打包自定义字体，减少包体积与首屏闪烁                                                         |

图标通过语义名映射，业务代码不直接写 Ionicons 名称：

```tsx
// src/ui/primitives/Icon.tsx
export const ICONS = {
  back: 'chevron-back',
  settings: 'settings-outline',
  spark: 'sparkles',
  // …
};
```

新增图标：在 `ICONS` 里加一条语义名 → Ionicons 名称，再在组件里 `<Icon name="xxx" />`。
需要换图标集时只改这一个文件。

## 令牌

### 间距（8pt 栅格）

`xxs 2 / xs 4 / sm 8 / md 12 / lg 16 / xl 20 / xxl 24 / huge 40`

页面统一使用 `theme.spacing.*`，页面左右留白为 `lg (16)`。

### 圆角

`xs 6 / sm 8 / md 12 / lg 16 / xl 20 / xxl 26 / pill 999`

| 用途                       | 取值                |
| -------------------------- | ------------------- |
| 输入框、按钮               | `md (12)`           |
| 卡片、消息块               | `lg (16)`           |
| 弹窗                       | `xl (20)`           |
| 输入框外壳（发送框）、胶囊 | `xxl (26)` / `pill` |

### 字号阶梯

| token      | 字号 / 行高  | 用途                     |
| ---------- | ------------ | ------------------------ |
| `overline` | 11 / 14，600 | 分组小标题（设置页分区） |
| `caption`  | 11 / 16      | 时间、元信息、角标       |
| `footnote` | 12 / 18      | 辅助说明、次要按钮文字   |
| `label`    | 13 / 18，500 | 表单标签、行内标题       |
| `body`     | 15 / 23      | 正文、消息内容           |
| `title`    | 17 / 24，600 | 页面标题、卡片标题       |
| `headline` | 20 / 28，700 | 欢迎页主标题             |

### 图标与控件

- 图标尺寸：`sm 16 / md 18 / lg 20 / xl 24`。
- 触控目标：`controlSize.sm 32 / md 40`，图标按钮不会小于 32×32。

### 颜色

语义色板分为：背景 / 表面 / 边框 / 文字三级 / 强调色 / 状态色（危险、警告）
/ 代码块 / 引用 / 遮罩。浅色与深色各自一份，页面只用语义名：

```tsx
<AppText tone="secondary">…</AppText>
<Icon name="spark" tone="accent" />
```

## 基础组件

| 组件                                      | 说明                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `AppText`                                 | 统一文本：`variant`（字号阶梯）+ `tone`（语义色）                       |
| `Button`                                  | 4 种变体（primary / secondary / soft / dangerSoft）× 2 种尺寸，支持图标 |
| `IconButton`                              | 透明底图标按钮，强制提供 `accessibilityLabel`                           |
| `Chip`                                    | 胶囊标签，用于模型预设等可选项                                          |
| `Card`                                    | 容器：surface / muted / accent / danger，可携带 `onPress`               |
| `Divider`                                 | 1px 分割线，支持缩进                                                    |
| `TextField`                               | 输入框：聚焦高亮、标签、说明、右侧附加控件                              |
| `SegmentedControl`                        | 分段控件，选中态用表面色浮起                                            |
| `Toggle`                                  | 自绘开关，替代 `Switch`（RNW 上颜色不受控）                             |
| `ListRow`                                 | 设置行：标题 + 说明 + 右侧控件，整行可点                                |
| `EmptyState`                              | 空状态：插画 + 标题 + 说明 + 可选操作                                   |
| `Dialog` / `DialogHost`                   | 应用内确认框、输入框与操作菜单，见下                                    |
| `Screen` / `ContentColumn` / `PageHeader` | 页面骨架：安全区、内容列、统一头部                                      |

## 对话框

`react-native-web` 上的 `Alert.alert` 是空实现，因此确认框与操作菜单统一在应用内
渲染，三端表现一致：

```tsx
import {showAlert} from '../primitives/dialogStore';

showAlert('删除对话', '该对话将被永久删除。', [
  {text: '取消', style: 'cancel'},
  {text: '删除', style: 'destructive', onPress: () => deleteConversation(id)},
]);
```

- 1 个按钮 → 提示框；2 个 → 确认框（取消在左，主操作在右，危险操作用红色）。
- 3 个及以上按钮 → 纵向操作菜单（危险项红色，取消单独分隔）。
- `openPrompt` 复用同一队列渲染单行输入（重命名等），背景点击等同取消。
- `showAlert` 与 `openActionMenu` 写入同一个 `useDialogStore` 队列，支持「菜单 →
  二次确认」的串联。
- 背景遮罩与卡片是兄弟节点，点击卡片内部不会误触关闭。

`DialogHost` 在 `AppRoot` 中挂载一次即可。

## Web 适配

- `ContentColumn` 限制内容最大宽度 `760`，桌面浏览器中居中显示，避免长文本铺满
  屏幕。
- `PageHeader` 与 `DialogHost` 全宽渲染，内容列在其内部居中。
- 可点击元素在 Web 上补 `cursor: pointer`（`primitives/interaction.ts`），并禁用
  文本选中。

## 新增页面清单

1. 用 `Screen` + `PageHeader` 搭骨架，内容放进 `ContentColumn`。
2. 文本一律用 `AppText`，颜色用 `tone`，不要写死 `#RGB`。
3. 间距 / 圆角 / 字号从 `theme` 取，不写魔法数字。
4. 图标从 `Icon` 的语义名里选；缺图标就先补 `ICONS` 映射。
5. 需要新交互模式时先看 `primitives` 是否已有；没有就新增基础组件，而不是在页面里
   拼样式。
6. 用 `pnpm web` 在 390×844 与桌面宽度各看一遍，浅色 / 深色都确认。
