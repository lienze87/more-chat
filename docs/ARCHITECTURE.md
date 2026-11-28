# 架构说明

## 目标

把 DeepSeek Chat Completions 的扩展能力（思考、服务端工具、引用、标题、安全审核）映射成可渲染、可回放、可持久化的对话模型，并保持 Android 端的流畅与可维护性；同一套代码通过 `react-native-web` 在浏览器中调试。

架构地图、状态所有权、已知偏离与治理任务池见 [架构治理](architecture/GOVERNANCE.md)，影响边界的决定见 [架构决策记录](architecture/DECISIONS.md)。

## 分层

```text
L5  app/            组装：Provider、导航、启动引导
L5  ui/             展示：screens（页面）、components（消息/思考/工具）、primitives（设计系统）、navigation（路由契约）
L4  features/       状态与编排：chatStore、settingsStore、chatEngine、chatRun、streamReducer
L2  adapters/       实现：api（请求构造、SSE 传输/解析、错误翻译）、data（AsyncStorage 仓储）、files、js、platform（ID、剪贴板、运行平台）
L0  domain/         纯逻辑：消息模型、客户端工具参数、引用编号、latest_reminder
L0  config/         常量与默认系统提示词：存储 key、超时、长度上限
L0  utils/          跨层纯函数：文本、URL；不得依赖平台或状态层
```

依赖只允许自上而下。`domain` 和 `config` 独立于应用层与平台实现，核心逻辑可直接用 Jest 覆盖。

### 架构门禁

oxlint 不做跨文件依赖分析，knip 只管未使用代码，两者都发现不了循环依赖与层次
倒置。`pnpm arch` 通过 `scripts/check-architecture.mjs` 检查以下规则。脚本复用项目的
TypeScript 解析器，读取静态导入、重导出、类型依赖和字面量 `import()`。

| 规则                        | 约束                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `domain`                    | 只能依赖自身；禁止 react / react-native / zustand / AsyncStorage |
| `config`                    | 不得依赖 `src/` 内的模块                                         |
| `ui/primitives`、`ui/theme` | 不得依赖 features / adapters / app（主题由调用方注入）           |
| `ui`                        | 不得依赖 `app`（路由契约由 `ui/navigation` 拥有）                |
| `features`                  | 不得依赖 ui，也不得直接依赖 React Native / Expo 平台包           |
| `utils`                     | 只放纯函数；不得依赖 features / adapters / ui / app 或平台包     |
| `adapters`                  | 不得依赖 features / ui / app                                     |
| 全局                        | 任何模块级别的循环依赖                                           |

规则写在脚本里，CI 与 `pnpm check` 都会执行。出现分层违规时，输出包含引用位置和原因。

## 消息模型

```ts
AssistantMessage {
  content          // 纯文本回答，用于展示与回传
  segments[]       // 时间线：thinking | tool | client_tool | text
  reasoning        // 回传用的 reasoning_content（有工具时为最后一步）
  serverToolCalls[]// 原样回传的服务端工具步骤
  clientToolCalls[]// 当前子轮次的客户端工具调用
  toolRounds[]     // 已完成的工具子轮次，用于回放请求历史
  annotations[]    // 引用角标
  status           // streaming | awaiting_tool | complete | error | aborted | refused
}
```

`segments` 保留模型输出的真实顺序：思考 → 搜索 → 思考 → 阅读网页 → 回答。UI 把相邻 thinking 合并为可折叠块，tool 渲染为卡片，text 渲染为 Markdown。

`ask_user` 调用会暂停运行，等待用户选择或自定义回答后再继续；自定义输入框聚焦期间暂停计时，失焦、离开页面或应用退到后台时恢复剩余计时，60 秒内未确认则按“未选择”返回并继续运行。

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
            │    └─ openSseTransport（Expo Fetch 可读流）
            │         └─ SseParser → JSON chunk → onChunk
            ├─ 批量 flush → chatStore.appendAssistantChunks
            │    └─ applyStreamChunk（纯函数）
            └─ 完成 / 失败 / 停止
                 ├─ 确认助手消息终态
                 ├─ 写入模型标题
                 └─ 释放运行态、清 streaming
```

`chatRun` 管理当前运行、缓冲队列与定时器，并向 store 同步界面使用的
`streaming` 标记。完成、失败、启动异常和主动停止共用收尾逻辑。删除或清空对话时，
`chatEngine` 先取消对应的运行，再修改会话数据。主动停止通过 AbortController 中止请求，并忽略该轮迟到的回调。

设计要点：

1. **纯函数归并**：`applyStreamChunk` 不触碰 React，便于测试思考/工具/拒答等边界。
2. **批量更新**：按 [`CHAT_LIMITS.streamFlushIntervalMs`](../src/config/appConfig.ts) 批量归并 chunk，减少 React 更新与 Markdown 重排。
3. **显式终态**：完成、截断、拒答、中止、失败有对应的界面反馈。客户端工具调用在执行并回传结果后继续生成，模型请求不可用工具时收为可重试的失败。
4. **回传正确性**：`requestBuilder` 从消息模型还原各轮思考、工具调用及其结果。详见 [DeepSeek API 集成](DEEPSEEK_INTEGRATION.md#回传)。
5. **拒答清理**：收到 `content_filter` 后清空思考与正文，仅保留工具卡片，避免展示已流出的违规文本。

## 持久化

- AsyncStorage 存放 `settings` 和 `conversations`。
- Skill 包通过 `skillRepository` 保存到 `fileStorage` 的 `skill/*` 键，加载时校验结构并跳过损坏记录。
- 会话写入使用 `createThrottledSaver`：流式期间按 [`PERSISTENCE_INTERVALS.conversationsThrottleMs`](../src/config/appConfig.ts) 合并写入，应用退到后台时立即提交待写数据。
- 读取时校验当前会话结构，并将中断的生成和工具调用收尾。
- 原生端通过 `credentialsRepository` 将 API Key 保存至 SecureStore，Web 端由
  `credentialsRepository.web.ts` 在页面内存中持有。

## 主题与自适应

- `ThemeProvider` 读取系统配色与设置，提供语义色板（背景、表面、边框、强调色等）。
- 页面使用 `react-native-safe-area-context` 处理刘海与手势条；输入框底部自适应 inset。
- Android 使用 edge-to-edge 模板配置（由 `expo prebuild` 生成）。edge-to-edge 下键盘不再缩小窗口，首页用 `KeyboardAvoidingView`（`behavior="padding"`）把输入区顶到键盘上方。
- Web 端由 `react-native-web` 渲染。确认框和操作菜单统一由 `DialogHost` 使用 `Modal` 展示，外链使用 `Linking` 打开。
- 原生端通过 `expo-clipboard` 复制回复。Web 端使用浏览器的 Clipboard API。重新生成从选中的回复开始截断并重写后续轮次。

## 扩展点

| 需求                           | 改动位置                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 文件上传 / 图片                | `api/types.ts` 的 content 联合类型 + `requestBuilder` + Composer                                                            |
| 点击文件                       | `MarkdownText` 的 `onOpenPath` 和 `filePaths` 中的应用内路径校验                                                            |
| 运行中向用户提问               | `features/extensions/askUser` 的提问队列 + `ask_user` 工具定义 + `AskUserCard`                                              |
| 语音输入 / TTS                 | 新增 `api/audio` + Composer 麦克风按钮                                                                                      |
| 客户端工具（function calling） | `features/extensions/clientTools` 生成每轮工具快照，`toolDefinitions` 定义 Zod schema；供模型声明、直接调用和脚本子调用共用 |
| 会话分片存储                   | 替换 `conversationRepository`，store 接口不变                                                                               |
| 凭据存储                       | `credentialsRepository.ts`（原生）和 `credentialsRepository.web.ts`                                                         |

[`code_exec` 设计与维护说明](CODE_EXEC.md)记录脚本接口、宿主工具桥接、各平台的执行后端及验证方式。

## pnpm 依赖布局

仓库使用 pnpm 的默认 isolated 布局。pnpm 版本以 [CI 配置](../.github/workflows/ci.yml) 为准。

- Metro 解析符号链接。修改运行时依赖后，用 `pnpm export:android` 和 `pnpm export:web` 检查对应平台的模块图。
- 原生工程由 `expo prebuild` 生成，`android/settings.gradle` 通过 `expo-modules-autolinking` 与 React Native Gradle 插件自动解析依赖路径，因此 `@react-native/gradle-plugin`、`@react-native/codegen` 仍在 `devDependencies` 中显式声明。
- 代码检查使用 oxlint / oxfmt（Rust 单二进制），不经过 ESLint 插件解析，pnpm isolated 布局下没有额外的插件提升问题。
- 新增原生库后，如果 Gradle 找不到其路径，优先检查该库是否需要在 `devDependencies` 中显式声明，或先执行 `pnpm expo prebuild --clean`。
