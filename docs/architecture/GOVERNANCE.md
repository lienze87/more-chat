# 架构治理

本文件记录 MoreChat 的架构地图、状态所有权、单一事实来源、已知偏离和治理任务池。
它服务于一个持续循环：扫描 → 找偏离 → 分析调用方 → 选总复杂度最低的方案 →
建基线 → 完成迁移 → 删除旧实现 → 复审 → 验证 → 加防回归约束。

治理基线：`main@9d1f75f`（2026-11-28）。改动都在隔离 worktree 的分支上进行，每批
独立提交。

## 判定标准

一批改动只有同时满足以下条件才算完成：

1. 目标语义只有一个权威实现，旧实现已删除或明确标注为兼容层并说明调用方。
2. 行为基线（相关 Jest 用例）在改动前后一致；新增行为有对应用例。
3. `pnpm arch`、`pnpm typecheck`、`pnpm lint`、`pnpm knip` 通过；涉及格式时
   `pnpm format:check` 通过。
4. 架构规则变化同步进 [`scripts/check-architecture.mjs`](../../scripts/check-architecture.mjs)、
   [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) 和本文件。
5. 提交信息符合 [提交规范](../CONTRIBUTING.md)。

## 分层与职责

```text
App.tsx
  └─ src/app        组装：Provider、导航、启动引导、生命周期副作用
       ├─ src/ui    展示：screens（页面）、components（业务展示）、primitives（设计系统）、theme
       ├─ src/features  状态与编排：chat / settings / extensions
       ├─ src/adapters  实现：api、data、files、js、platform（平台能力）
       ├─ src/domain    纯模型与规则：消息、设置、引用、用户元信息、文件路径
       ├─ src/config    常量与默认提示词
       └─ src/utils     跨层纯函数（文本、URL；不得依赖平台与上层）
```

依赖方向：

- `app` 可以依赖所有下层；`ui` 可以依赖 `features`、`adapters`、`domain`、`config`、`utils`。
- `ui` 不得依赖 `app`：路由参数是 UI 与组装层共享的契约，权威定义放在 UI。
- `features` 不得依赖 `ui` / `app`，也不得直接依赖 React Native 或 Expo 平台包；
  平台差异通过 `adapters/platform` 暴露。
- `adapters` 不得依赖 `features` / `ui` / `app`；`adapters/platform` 可以被上层使用。
- `domain` 只依赖自身；`config` 不依赖 `src/`；`utils` 只依赖 `config` / `domain` 和纯 JS 库。
- 任何模块级循环依赖都不允许。

这些规则由 `pnpm arch` 执行；规则表是唯一权威，文档只做解释。

## 当前依赖概况

基线（`9d1f75f`）：95 个模块、359 条内部依赖边、0 循环、0 倒置。

跨目录依赖（按目标目录聚合，未计目录内边）：

| 来源       | 目标                                                            |                    边数 | 说明                                 |
| ---------- | --------------------------------------------------------------- | ----------------------: | ------------------------------------ |
| `adapters` | `config` / `domain` / `utils`                                   |              11 / 8 / 1 | 适配器读取常量、领域类型与纯函数     |
| `features` | `adapters` / `config` / `domain` / `utils`                      |        19 / 13 / 12 / 3 | 编排层组合实现与规则                 |
| `ui`       | `features` / `domain` / `config` / `adapters` / `app` / `utils` | 17 / 15 / 7 / 5 / 5 / 5 | 历史基线；`ui -> app` 已在 G-01 消除 |
| `app`      | `ui` / `features`                                               |                  10 / 3 | 组装入口                             |

高扇入模块（被依赖次数）：`config/appConfig`（30）、`ui/theme/ThemeProvider`（37）、
`ui/primitives/AppText`（27）、`domain/chat/types`（21）、`ui/primitives/interaction`（16）。
高扇出模块：`ui/screens/ChatScreen`（20）、`ui/components/AssistantMessageView`（17）、
`ui/screens/ExtensionsScreen`（16）、`features/chat/chatEngine`（14）。
扇出集中在页面是正常的；页面的编排细节应继续下沉到 hook 或 feature。

## 状态所有权

| 状态                     | 权威位置                          | 持久化                                         | 备注                                                                 |
| ------------------------ | --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| 会话列表、消息、标题     | `features/chat/chatStore`         | AsyncStorage `conversations`                   | 冷启动修复中断的流式/工具状态                                        |
| 当前运行、流式缓冲、取消 | `features/chat/chatRun`           | 无                                             | `chatStore.streaming` 是给 React 的镜像，两者只由 `chatRun` 同步写入 |
| 设置                     | `features/settings/settingsStore` | AsyncStorage `settings`                        | 写入前统一 `normalizeSettings`                                       |
| API Key                  | `features/settings/settingsStore` | SecureStore（原生）/ 页面内存（Web）           | 不在 AsyncStorage 中                                                 |
| Skill 列表               | `features/extensions/skillsStore` | `skillRepository` → `fileStorage` 的 `skill/*` | 导入后按名称排序                                                     |
| 待回答的 `ask_user`      | `features/extensions/askUser`     | 无                                             | 冷启动由持久化层收尾                                                 |
| 对话框队列               | `ui/primitives/dialogStore`       | 无                                             | 全局 `DialogHost` 渲染                                               |
| 主题                     | `ui/theme/ThemeProvider`          | 设置持久化                                     | `ThemeMode` 由 domain 定义                                           |
| 页面临时状态             | 各 screen                         | 无                                             | 选中会话、输入草稿、滚动跟随、键盘 inset                             |

共享可变状态只允许出现在 store 内；模块级变量仅用于进程级单例（`chatRun`、
`pendingMutation`、QuickJS engine），并在测试里通过模块隔离重置。

## 单一事实来源

| 关注点                       | 权威位置                                                     | 主要调用方                             |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| 运行时常量、限额、存储 key   | `src/config/appConfig.ts`                                    | 全仓库                                 |
| 默认系统提示词               | `src/config/defaultSystemPrompt.ts`                          | `requestBuilder`                       |
| 消息 / 工具 / 会话模型       | `src/domain/chat/types.ts`                                   | features、adapters、ui                 |
| 设置默认值与枚举             | `src/domain/settings/types.ts`、`options.ts`、`normalize.ts` | 设置页、请求构造                       |
| 模型目录与能力               | `src/domain/settings/models.ts`                              | 设置页、`chatEngine`、`requestBuilder` |
| 服务端工具能力               | `src/domain/chat/capabilities.ts`                            | 请求构造、`env_info`                   |
| 引用编号与 Markdown 标记     | `src/domain/chat/citations.ts`                               | `MarkdownText`、`CitationSources`      |
| 应用内路径规则               | `src/features/extensions/filePaths.ts`                       | 文件工具、预览、Markdown 链接          |
| 应用内文件读取               | `src/features/extensions/appFiles.ts`                        | 文件工具、文件预览                     |
| 客户端工具契约（Zod schema） | `src/features/extensions/toolDefinitions.ts`                 | 工具声明、参数校验、脚本白名单         |
| 持久化结构校验               | `src/adapters/data/repositories/conversationRepository.ts`   | 冷启动恢复                             |
| Skill 持久化契约             | `src/adapters/data/repositories/skillRepository.ts`          | Skill 状态、文件工具                   |
| 设计令牌                     | `src/ui/theme/tokens.ts`                                     | 全部 UI                                |
| 架构边界                     | `scripts/check-architecture.mjs`                             | `pnpm arch`、CI                        |

“唯一来源”指同一语义只有一处定义；展示文案可以派生，但不得各自维护一份规则。

## 已知偏离与任务池

状态：`todo` / `doing` / `done` / `deferred`。`deferred` 必须写明原因或待确认事项。

| ID   | 问题                                                                              | 目标                                             | 风险 | 验证                                  | 状态                                     |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------ | ---- | ------------------------------------- | ---------------------------------------- |
| G-01 | `ui` 页面依赖 `app/navigation/types`，形成 `ui -> app` 反向边                     | 路由参数契约归 UI，`app` 反向引用                | 低   | typecheck、arch、相关页面手测         | done                                     |
| G-02 | 视觉模型名单硬编码在 `chatEngine`，且与 `MODEL_PRESETS` 不一致                    | 模型目录成为唯一来源，导出 `modelSupportsImages` | 低   | 新单测 + chatEngine 用例              | done                                     |
| G-03 | `webSearch`/`readUrl` 到 API 工具与 `env_info` 文案的映射分散两处                 | 服务端工具能力表 + 派生函数                      | 低   | capability 单测 + requestBuilder 用例 | done                                     |
| G-04 | Skill 文件读取在 `clientTools` 与 `FilePreviewScreen` 各有一份                    | 统一 `readAppFile`，显式区分 enabled/all         | 中   | 新单测 + 预览手测                     | done                                     |
| G-05 | `features` 直接依赖 `react-native`，`utils` 直接依赖 Expo                         | 平台能力下沉 `adapters/platform`，加境界规则     | 中   | arch fixture + 全量测试               | done                                     |
| G-06 | `ChatScreen` 同时承担滚动、键盘、抽屉、发送编排                                   | 抽出滚动/键盘 hook 与用户气泡组件                | 中   | typecheck + 手测滚动/键盘             | done                                     |
| G-07 | 服务端工具文案与动作解释在 `ToolCallCard` / `ToolProcessDisclosure` 重复          | 单一展示派生模块                                 | 低   | 新单测                                | done                                     |
| G-08 | `summarizeToolArguments`、`formatMessageTime` 仅测试使用                          | 删除死代码或接入真实调用方                       | 低   | knip + 全量测试                       | done                                     |
| G-09 | `fileTools` / `FileToolSnapshot` 命名与实际内容（含 `ask_user`、`code_exec`）不符 | 统一为客户端工具命名                             | 中   | 全量测试 + typecheck                  | done                                     |
| G-13 | 引用来源编号在 `extractCitationSources` 与 `buildCitedMarkdown` 各算一次          | 角标编号与来源列表共用同一排序/去重结果          | 低   | citations 单测                        | done                                     |
| G-14 | `chatClient` 硬编码默认 Base URL，与设置默认值重复                                | 复用 `DEFAULT_BASE_URL`，补 URL 构造单测         | 低   | chatClient 单测                       | done                                     |
| G-15 | `skillsStore` 直接操作 fileStorage，JSON.parse 无校验                             | 引入 skillRepository，校验并跳过损坏记录         | 中   | repository/store 单测                 | done                                     |
| G-16 | `AssistantMessageView` 内嵌思考合并与工具分组，无法独立测试                       | 抽出 assistantTimeline 纯函数并补单测            | 低   | timeline 单测                         | done                                     |
| G-10 | 架构门禁保留未实现的 `runtime` 规则                                               | 删除规划规则；引入时再加                         | 低   | arch + 门禁自测                       | done                                     |
| G-11 | 持久化结构校验与 `domain` 类型是两套手写定义                                      | 评估用同一 schema 派生，或明确校验层职责         | 高   | 兼容性样本 + 全量测试                 | deferred（需评估旧数据兼容策略）         |
| G-12 | 日志只有零散 `console.warn`，无统一观测出口                                       | 评估是否引入最小 logger；客户端暂无远端采集需求  | 低   | 设计确认                              | deferred（无明确产品需求，避免新增抽象） |

## 每轮闭环

1. 在任务池取一项，先写清调用方和契约。
2. 跑相关测试，记录基线；必要时补特征测试。
3. 迁移全部调用方，删除被替代实现。
4. 跑 `pnpm arch` + `typecheck` + 相关测试；按影响扩大到 `lint` / `knip` / 全量测试。
5. 独立复审 diff：命名、依赖方向、异常路径、旧数据兼容。
6. 提交；更新任务池与 ADR。

## 基线验证

| 检查                | 基线结果                                    |
| ------------------- | ------------------------------------------- |
| `pnpm arch`         | 95 个模块，359 条内部依赖边，0 循环，0 倒置 |
| `pnpm typecheck`    | 通过                                        |
| `pnpm lint`         | 0 warning / 0 error                         |
| `pnpm knip`         | 通过                                        |
| `pnpm format:check` | 145 个文件通过                              |
| Jest                | 21 个 suite / 199 个用例通过                |

Windows 本地运行 Jest 需要显式设置环境变量：

```powershell
$env:NODE_OPTIONS='--experimental-vm-modules'; pnpm exec jest --runInBand
```
