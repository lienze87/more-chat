# 架构说明

## 目标

把 DeepSeek Chat Completions 的扩展能力（思考、服务端工具、引用、标题、安全审核）映射成可渲染、可回放、可持久化的对话模型，并保持 Android 端的流畅与可维护性；同一套代码通过 `react-native-web` 在浏览器中调试。

## 分层

```text
L5  app/            组装：Provider、导航、启动引导
L5  ui/             展示：screens（页面）、components（消息/思考/工具）、primitives（设计系统）
L4  features/       状态与编排：chatStore、settingsStore、chatEngine、chatRun、streamReducer
L2  adapters/       实现：api（请求构造、SSE 传输/解析、错误翻译）、data（AsyncStorage 仓储）
L0  domain/         纯逻辑：消息模型、客户端工具参数、引用编号、latest_reminder
L0  config/         常量与默认系统提示词：存储 key、超时、长度上限
```

依赖只允许自上而下。**`domain` 与 `config` 是叶子节点**：不 import React Native、
zustand 或 AsyncStorage，因此核心逻辑可以直接用 Jest 覆盖。

### 架构门禁

oxlint 不做跨文件依赖分析，knip 只管未使用代码，两者都发现不了循环依赖与层次
倒置。因此有 `pnpm arch`（`scripts/check-architecture.mjs`，零依赖、约 100ms）：

| 规则                        | 约束                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `domain`                    | 只能依赖自身；禁止 react / react-native / zustand / AsyncStorage     |
| `config`                    | 不得依赖任何其它模块                                                 |
| `ui/primitives`、`ui/theme` | 不得依赖 features / adapters / app（主题由调用方注入）               |
| `features`                  | 不得依赖 ui                                                          |
| `adapters`                  | 不得依赖 features / ui / app                                         |
| `runtime`（规划）           | 只允许 domain 与 ports，禁止 adapters / features / ui / react-native |
| 全局                        | 任何模块级别的循环依赖                                               |

规则写在脚本里，CI 与 `pnpm check` 都会执行；违反时直接打印「谁依赖谁」和原因。

## 消息模型

```ts
AssistantMessage {
  content          // 纯文本回答，用于展示与回传
  segments[]       // 时间线：thinking | tool | text
  reasoning        // 回传用的 reasoning_content（有工具时为最后一步）
  serverToolCalls[]// 原样回传的服务端工具步骤
  annotations[]    // 引用角标
  status           // streaming | complete | error | aborted | refused
}
```

`segments` 保留模型输出的真实顺序：思考 → 搜索 → 思考 → 阅读网页 → 回答。UI 把相邻 thinking 合并为可折叠块，tool 渲染为卡片，text 渲染为 Markdown。

用户消息额外保存两个发送时快照：`reminder`（官方 `latest_reminder` 内容）与 `envInfo`（`<env_info>` 块）。请求构造时 `composeUserContent` 用 `<user_query>` 包裹正文，历史回放沿用当时的快照，而不是用当前设置重新计算。

## 流式链路

```text
ChatScreen.submit
  └─ chatEngine.sendMessage
       ├─ 写入 user 消息（含 latest_reminder 与 <env_info> 快照）
       ├─ 写入 assistant 占位（status=streaming）
       ├─ buildChatRequest（默认提示词 + 设置页附加提示词，按设置拼 tools / thinking / safety / title）
       └─ chatRun.start（createChatRunController）
            ├─ streamChatCompletion
            │    └─ openSseTransport（XHR 增量 responseText）
            │         └─ SseParser → JSON chunk → onChunk
            ├─ 40ms 批量 flush → chatStore.appendAssistantChunks
            │    └─ applyStreamChunk（纯函数）
            └─ 完成 / 失败 / 停止
                 ├─ 确认助手消息终态
                 ├─ 写入模型标题
                 └─ 释放运行态、清 streaming
```

`chatRun` 管理当前运行、缓冲队列与 40ms 定时器，并向 store 同步界面使用的
`streaming` 标记。完成、失败、启动异常和主动停止共用收尾逻辑。删除或清空对话时，
`chatEngine` 先取消对应的运行，再修改会话数据。主动停止会中止 XHR，并忽略该轮迟到的回调。

设计要点：

1. **纯函数归并**：`applyStreamChunk` 不触碰 React，便于测试思考/工具/拒答等边界。
2. **批量更新**：每 40ms 合并一次 chunk，避免每 token 一次 React 更新与 Markdown 重排。
3. **显式终态**：完成、截断、拒答、中止、失败有对应的界面反馈。需要本机执行工具的响应会收为可重试的失败。
4. **回传正确性**：带 `tools` 的请求必须回传 `reasoning_content` 与 `server_tool_calls`，`requestBuilder` 从消息模型还原。
5. **拒答清理**：收到 `content_filter` 后清空思考与正文，仅保留工具卡片，避免展示已流出的违规文本。

## 持久化

- AsyncStorage 存放 `settings` 和 `conversations`。`credentials` 是旧版迁移使用的键。
- 会话写入使用 `createThrottledSaver`：流式期间合并写，最多 1.2s 落盘一次；应用退到后台时强制 flush。
- 读取时做结构校验，历史中断（status=streaming）会被修复为 aborted。
- 原生端通过 `credentialsRepository` 将 API Key 保存至 SecureStore，Web 端由
  `settingsStore` 在内存中持有。两端会清理旧版保存在 AsyncStorage 中的凭据。

## 主题与自适应

- `ThemeProvider` 读取系统配色与设置，提供语义色板（背景、表面、边框、强调色等）。
- 页面使用 `react-native-safe-area-context` 处理刘海与手势条；输入框底部自适应 inset。
- Android 使用 edge-to-edge 模板配置（由 `expo prebuild` 生成）。edge-to-edge 下键盘不再缩小窗口，首页用 `KeyboardAvoidingView`（`behavior="padding"`）把输入区顶到键盘上方。
- Web 端由 `react-native-web` 渲染：`Alert` 在 RNW 中是空实现；确认框与操作菜单统一走 `DialogHost`，`Linking` 打开外链。
- 消息脚注提供「复制 / 重新生成」两个操作：复制走 `src/utils/clipboard.ts`（Web 用 `navigator.clipboard`，原生用 RN 内置 `Clipboard`，后续可换成 `expo-clipboard`）；重新生成从该条回复开始截断并重写后续轮次。

## 扩展点

| 需求                           | 改动位置                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| 文件上传 / 图片                | `api/types.ts` 的 content 联合类型 + `requestBuilder` + Composer    |
| 语音输入 / TTS                 | 新增 `api/audio` + Composer 麦克风按钮                              |
| 客户端工具（function calling） | `ClientToolCall` 已就位；补 `runtime/tools` 注册表与执行循环        |
| 会话分片存储                   | 替换 `conversationRepository`，store 接口不变                       |
| 凭据存储                       | `credentialsRepository.ts`（原生）和 `credentialsRepository.web.ts` |

## pnpm 依赖布局

仓库使用 pnpm 12.21.0 的默认 isolated 布局，`node_modules` 中是符号链接而不是平铺目录：

- Metro 解析符号链接，`pnpm export:android` / `pnpm export:web` 已在 CI 中验证可生成 bundle。
- 原生工程由 `expo prebuild` 生成，`android/settings.gradle` 通过 `expo-modules-autolinking` 与 React Native Gradle 插件自动解析依赖路径，因此 `@react-native/gradle-plugin`、`@react-native/codegen` 仍在 `devDependencies` 中显式声明。
- 代码检查使用 oxlint / oxfmt（Rust 单二进制），不经过 ESLint 插件解析，pnpm isolated 布局下没有额外的插件提升问题。
- 新增原生库后，如果 Gradle 找不到其路径，优先检查该库是否需要在 `devDependencies` 中显式声明，或先执行 `pnpm expo prebuild --clean`。
