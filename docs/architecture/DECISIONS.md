# 架构决策记录

记录会影响模块边界、状态所有权、数据契约和验证方式的决定。每条决策包含背景、
决定、后果；被推翻时保留原文并标注 `Superseded by`。

## ADR-0001：在隔离 worktree 中分批治理

**背景**：这次治理会同时触及分层、契约与大量 UI 文件，直接在主工作区连续改动
难以隔离实验、回滚单批改动，也容易与用户已有工作混淆。

**决定**：在独立 worktree（`../more-chat-arch`，分支 `arch/entropy`）中执行；
每批完整闭环独立提交；主工作区保持干净。每批只做一类语义迁移，不把无关重命名
混进同一提交。

**后果**：提交历史即治理记录；跨批冲突需要显式合并。验证命令在 worktree 内执行，
Windows 下 Jest 需显式设置 `NODE_OPTIONS=--experimental-vm-modules`。

## ADR-0002：分层规则由脚本执行，而不是只写在文档里

**背景**：`oxlint` 不做跨文件依赖分析，`knip` 只看未使用代码，都无法阻止循环依赖
和层次倒置。

**决定**：`scripts/check-architecture.mjs` 用 TypeScript AST 解析静态导入、重导出、
类型依赖和字面量动态导入，作为规则表唯一权威；CI 与 `pnpm check` 都执行。新增边界
规则时，同时补 `__tests__/checkArchitecture.test.js` 的 fixture。

**后果**：规则可执行、可测试；但只能分析静态可解析依赖，barrel 与运行时注入不在
覆盖范围内，因此仍禁止无意义 barrel。

## ADR-0003：路由参数契约归 UI

**背景**：五个 screen 都从 `app/navigation/types` 导入 `RootStackParamList`，形成
`ui -> app` 反向依赖；`app` 负责组装，本不应被展示层反向依赖。

**决定**：路由参数类型迁移到 `src/ui/navigation/types.ts`，由 UI 拥有；`app` 的
导航器反向导入。架构门禁增加 `ui` 不得依赖 `app` 的规则。

**后果**：`ui/routes` 成为页面契约的权威位置；新增页面时先改这里。`app` 仍负责
注册 screen 和选择初始路由。

## ADR-0004：枚举与模型目录共用运行时数据

**背景**：`normalizeSettings` 为 `reasoningEffort`、`safetyLevel`、`themeMode`、
`language` 各维护一份字符串数组，类型定义另起一套；模型视觉能力在 `chatEngine`
硬编码，`MODEL_PRESETS` 又不含实验性视觉模型。修改一个枚举或模型需要同步多个文件。

**决定**：`domain/settings/options.ts` 用 `as const` 数组同时导出类型和运行时列表，
`normalize` 用同一列表校验；`domain/settings/models.ts` 用一张模型能力表派生设置页
预设、默认模型解析和视觉能力判断。

**后果**：新增枚举值或模型只改一处；未知模型默认不支持图片。`types.ts` 只保留
`Settings` 形状与默认值，并重导出枚举类型，调用方路径不变。

## ADR-0005：服务端工具能力表是声明与描述的唯一来源

**背景**：`requestBuilder` 用 `settings.webSearch` / `settings.readUrl` 拼 API 工具，
`chatEngine` 又用同一组开关拼 `<env_info>` 的中文能力清单。两边各自维护一份映射，
新增工具或改文案会漂移。

**决定**：`domain/chat/capabilities.ts` 定义能力表（API 类型、设置开关、展示名称），
请求构造和能力描述都从 `enabledServerToolCapabilities` 派生。

**后果**：工具声明顺序与 `env_info` 顺序一致；新增服务端工具只改能力表。`env_info`
仍保留客户端固定能力（本地文件、JavaScript 执行），因为它们不来自设置开关。

## ADR-0006：Skill 文件读取只有一个入口，访问级别显式传入

**背景**：模型工具只允许读取已启用的 Skill，文件预览允许读取任意已安装的 Skill；
两处各自解析 `skills/<名称>/<路径>` 并检查 `Object.hasOwn`，路径规则和权限差异都
可能漂移。

**决定**：`features/extensions/appFiles.ts` 提供 `readSkillFile` 与 `readAppFile`，
用显式的 `skillAccess: 'enabled' | 'all'` 表达调用方权限；`clientTools` 传 `enabled`，
`FilePreviewScreen` 传 `all`。`workspace/` 的读取也走同一入口。

**后果**：新增文件来源（例如未来只读资源目录）只需改 `readAppFile`。`workspaceFiles`
只保留工作区列表，不再重复提供读取函数。

## ADR-0007：平台能力只经 adapters/platform 进入业务层

**背景**：`chatEngine` 读取 `Platform.OS` 拼环境快照，`utils/ids` 依赖 `expo-crypto`，
`utils/clipboard` 依赖 `expo-clipboard`。业务层和工具函数直接绑定平台包后，无法在
不加载 React Native 的环境里测试，`utils` 也不再是纯函数层。

**决定**：新增 `adapters/platform`，容纳 `ids`、`clipboard`（含 Web 实现）和
`runtimePlatform`。`features` 与 `utils` 禁止导入 React / React Native / Expo /
React Navigation 包，规则加入架构门禁并配 fixture。

**后果**：feature 层可脱离 React 与平台测试；新增平台能力时先建 adapter，再由
feature 注入或调用。Web 与原生仍靠 Metro 的平台后缀选择实现。

## ADR-0008：页面只做编排，滚动与键盘状态归 UI hooks

**背景**：`ChatScreen` 同时保存 `activeId`、输入草稿、抽屉、滚动跟随、键盘
inset，还包含 rAF 合并、`FlatList` ref、用户滚动判定和 Web `visualViewport`
分支。页面级状态与可复用的交互机制混在一起，修改滚动策略需要读完整页面。

**决定**：把滚动跟随拆到 `useChatAutoScroll`，键盘避让拆到 `useKeyboardInset`，
用户气泡拆到 `UserMessageBubble`。滚动“是否切换跟随”的判断抽成纯函数
`resolveFollowing`，用单测覆盖原生与 Web 的差异。

**后果**：`ChatScreen` 只保留页面编排与发送/重试流程；滚动策略可独立测试。hook
是 UI 内部实现，不引入跨层依赖，也不需要新的全局状态。

## ADR-0009：服务端工具展示派生集中在一个纯函数模块

**背景**：`ToolCallCard` 自己 switch `action.type` 生成标题与说明，
`ToolProcessDisclosure` 又独立判断 `search`、统计已完成的 `open_page` / `read_link`。
两处对同一批动作类型的解释可能漂移，且都难以脱离 React 测试。

**决定**：新增 `ui/components/serverToolPresentation.ts`，提供
`presentServerToolCall` 与 `presentServerToolProcess` 两个纯函数；两个组件只负责
布局和状态样式。

**后果**：新增服务端工具动作类型时只改展示模块；单测覆盖标题、域名回退、URL 去重
与未完成页面不计数的规则。

## ADR-0010：客户端工具注册表与工具定义分层命名

**背景**：`fileTools.ts` 实际注册了 `ask_user`、`code_exec` 等非文件工具，
`FileToolSnapshot`、`FileToolContext`、`FileToolDefinition` 也覆盖全部客户端工具。
命名把“文件操作”和“客户端工具协议”混在一起，新增工具时需要先分辨层次。

**决定**：统一为客户端工具命名：`clientTools.ts` 是运行时注册表与快照，
`toolDefinitions.ts` 是 Zod schema 与定义表；类型改为 `ClientToolSnapshot`、
`ClientToolContext`、`ClientToolDefinition`、`ClientToolResult`。真正只服务于文件
操作的 `FileToolWorkspace`、`FileToolError`、`fileOperations` 保留原名。

**后果**：文件操作与客户端工具协议边界清晰；`toolDefinitions.ts` 不再位于
`tools/index.ts` 这种浅 barrel 里。文档中的路径同步更新。

## ADR-0011：引用角标编号与来源列表共用同一排序结果

**背景**：`buildCitedMarkdown` 在插入角标时自行按 `end_index` 排序、按 URL 去重并
递增编号；`extractCitationSources` 为“参考来源”列表又实现了一遍。两套编号只要
过滤条件或排序有一处变化，正文角标就会和来源列表错位。

**决定**：`extractCitationSources` 成为编号权威：它过滤有效 URL 引用、按结束位置
排序、按 URL 去重并生成编号。`buildCitedMarkdown` 先用它得到 `sources`，再用
URL → 编号映射插入角标；两者共用 `sortedValidCitations`。

**后果**：正文角标与来源列表天然一致；非 `url_citation` 数据被统一忽略。代价是
`buildCitedMarkdown` 多一次 `sources` 遍历，但引用量很小，可忽略。
