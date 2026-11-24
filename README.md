# MoreChat

<img src="docs/app-icon.png" width="96" alt="MoreChat" align="right" />

基于 [DeepSeek API](https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot/) 的移动端 Chatbot，使用 React Native（TypeScript）+ **Expo** 构建。Android 为主目标，Web 端可调试，iOS 未验证。

原生工程由 `expo prebuild` 生成（CNG），仓库只保留 `app.json` 与 JS 代码；同一套代码可通过 Expo Go、开发构建或浏览器运行。

```text
首页（对话）──▶ 设置
   └─ 左侧抽屉：对话列表（点击切换 / 长按管理）+ 底部设置入口
```

## 已实现能力

- **流式对话**：Chat Completions SSE，逐字渲染，可随时停止。
- **深度思考**：`thinking` + `reasoning_effort`，思考过程可折叠展示。
- **联网搜索 / 链接阅读**：服务端工具 `deepseek_web_search`、`deepseek_read_url`，展示搜索步骤与来源卡片。
- **引用**：`annotations` 转为可点击的上标角标与「参考来源」列表。
- **会话标题**：首轮请求开启 `title`，模型返回后自动替换标题；失败时用首条提问兜底。
- **内容安全**：`safety_check` 可配置，处理 `finish_reason: content_filter` 拒答。
- **用户元信息**：按 `latest_reminder` 格式随消息发送日期、星期、语言、所在地。
- **消息结构**：用户消息附带发送时固化的 `<env_info>` 快照（版本、平台、可用工具），正文用 `<user_query>` 包裹，历史回放不会变成“当前”环境。
- **系统提示词**：内置 More 的人格与行动准则（`src/config/defaultSystemPrompt.ts`）始终发送，设置页内容追加在其后作为附加要求。
- **本地持久化**：会话、消息、设置保存在 AsyncStorage，防抖写入。
- **多会话管理**：左侧抽屉切换对话，长按重命名 / 清空 / 删除；启动后默认落在一段新对话。
- **体验细节**：深浅色主题、Markdown 渲染、复制回答、错误重试、空状态引导。

## 技术栈

| 领域   | 选型                                                                       |
| ------ | -------------------------------------------------------------------------- |
| 框架   | Expo SDK 58 + React Native 0.88.1（New Architecture）                      |
| 语言   | TypeScript 6                                                               |
| 包管理 | pnpm 12.21.0（isolated 布局，已适配 Metro 与 Gradle 的符号链接）           |
| 导航   | React Navigation 7（native-stack）                                         |
| 状态   | Zustand 5                                                                  |
| 存储   | AsyncStorage（Web 端落地为 localStorage）                                  |
| 渲染   | react-native-markdown-display                                              |
| 网络   | Expo Fetch 可读流与 SSE 解析                                               |
| Web    | react-native-web + Metro                                                   |
| 检查   | oxlint（lint）+ oxfmt（format），配置见 `.oxlintrc.json` / `.oxfmtrc.json` |

## 环境要求

- Node.js ≥ 22.12
- pnpm 12.x（与 CI 中的 12.21.0 保持一致；本仓库不使用 `packageManager` 字段自动切换版本，避免 pnpm 12 自管理时的 store 锁错误）。若 `pnpm --version` 不是 12.x，多半是 Node 自带的 corepack shim 在提供旧版本（corepack 默认落到它内置的 9.x）：`corepack disable pnpm` 之后再 `npm i -g pnpm@12.21.0`，让 PATH 上只剩这一份
- pnpm 12 默认不执行未声明的依赖构建脚本；`pnpm-workspace.yaml` 的 `allowBuilds` 已放行 `@parcel/watcher`（jest 的文件监听依赖），否则 `pnpm install` 会以 `ERR_PNPM_IGNORED_BUILDS` 失败
- 运行 Web：无需额外环境，`pnpm web` 即可
- 运行 Android 原生构建：JDK 17、Android SDK 37（platform 37、build-tools 37.0.0）、一台 Android 设备或模拟器（API 24+）
- 用 Expo Go 远程调试：手机安装与 SDK 58 匹配的 Expo Go

> `android/` 由 `expo prebuild` 按 `app.json` 生成，属于构建产物（已 gitignore）。SDK/NDK 版本由 `plugins/withAndroidSdkVersions.js` 固定为 **compileSdk 37 / build-tools 37.0.0 / NDK 28.2.13676358**。compileSdk 37 是硬性要求：Expo SDK 58 以预编译 AAR 分发 expo 模块（如 `expo.modules.asset:58.0.21`），其 AAR metadata 声明 `minCompileSdk=37`，用 36 会在 `checkDebugAarMetadata` 阶段失败。升级 React Native / Expo 后，先移除该插件的覆盖再重新 prebuild；仅用 Expo Go 远程调试时不需要本机安装 NDK。

## 快速开始

```bash
pnpm install
pnpm start                # Expo 开发服务器，按 a 打开 Android、w 打开 Web
pnpm android              # 首次会自动 prebuild，然后编译并安装 Debug 包
pnpm web                  # 浏览器调试（http://localhost:8081）
```

首次打开后进入 **设置 → 接口**，填入 DeepSeek API Key（`sk-...`）并点击保存。原生端通过系统凭据存储保留 Key，Web 端刷新后需要重新填写。清空输入框并保存即可移除 Key。

### Web 端调试

```bash
pnpm web                  # 开发模式，支持热更新
pnpm export:web           # 输出静态站点到 dist/
```

- `react-native-web` 负责渲染，`AsyncStorage` 在浏览器中使用 `localStorage`。
- `api.deepseek.com` 已返回 CORS 头，浏览器可直连；若换成自建代理，需要允许 `http://localhost:8081` 的跨域请求。
- 确认框与操作菜单使用应用内 `DialogHost`。Web 复制使用浏览器 Clipboard API，需要 HTTPS 或 localhost。原生复制使用 `expo-clipboard`。

### Expo 远程调试（真机 / 隧道）

```bash
pnpm start:lan            # 手机与电脑同一 Wi-Fi，Expo Go 扫码
pnpm start:tunnel         # 跨网络，走 @expo/ngrok 公网隧道
pnpm start:go             # 强制使用 Expo Go
adb reverse tcp:8081 tcp:8081   # USB 真机，把 Metro 端口映射到手机
```

Expo Go 只包含 Expo SDK 内置模块，本项目当前依赖均已内置，可直接扫码运行；后续若引入自定义原生模块，改用 `pnpm android` 生成开发构建。

### 构建 APK

```bash
pnpm prebuild             # 生成 android/（已 gitignore，属于构建产物）

# macOS / Linux
cd android && ./gradlew assembleDebug && ./gradlew assembleRelease

# Windows
cd android && gradlew.bat assembleDebug && gradlew.bat assembleRelease
```

也可直接使用 Expo CLI：`npx expo run:android --variant release`。
Release 包使用模板 debug 签名，发布前请替换。
产物：`android/app/build/outputs/apk/debug/app-debug.apk`。

> **Windows 注意**：Gradle/AGP 会为每个库生成 `prefab_command.bat` 启动脚本，CMake 还会在 `<模块>/android/.cxx/` 下建目录；Windows 的 `CreateProcess`（java、cmd.exe 均未声明 longPathAware，注册表 `LongPathsEnabled=1` 也无效）无法处理 260 字符以上的路径。pnpm 12 会把过长的虚拟 store 目录名哈希到 ≤ 60 字符（`virtualStoreDirMaxLength` 默认值），实际路径稳定在 ~220 字符，无需额外配置；若改用 pnpm 9.x（该默认值为 120，路径可达 ~290）并报 `CreateProcess error=2`，用 `pnpm install --virtual-store-dir=<短绝对路径>` 绕开即可。

### 常用命令

| 命令                                    | 作用                               |
| --------------------------------------- | ---------------------------------- |
| `pnpm start` / `pnpm start:clear`       | 启动 Expo 开发服务器 / 清缓存启动  |
| `pnpm start:lan` / `pnpm start:tunnel`  | 局域网 / 公网隧道（远程真机）      |
| `pnpm start:go`                         | 使用 Expo Go 打开                  |
| `pnpm web` / `pnpm web:clear`           | Web 调试 / 清缓存                  |
| `pnpm android`                          | prebuild + 编译安装 Debug 包       |
| `pnpm prebuild` / `pnpm prebuild:clean` | 生成 / 重新生成原生工程            |
| `pnpm typecheck`                        | TypeScript 全量类型检查            |
| `pnpm arch`                             | 架构门禁：循环依赖 / 分层倒置      |
| `pnpm lint`                             | oxlint                             |
| `pnpm format` / `pnpm format:check`     | oxfmt 格式化 / 只检查              |
| `pnpm knip`                             | 未使用文件 / 导出 / 依赖检查       |
| `pnpm test`                             | Jest 单元测试                      |
| `pnpm export:android`                   | 生成 Android JS bundle，验证模块图 |
| `pnpm export:web`                       | 导出静态 Web 站点到 `dist/`        |
| `pnpm check`                            | 串行跑完本地全部检查（同 CI）      |
| `pnpm doctor`                           | expo-doctor 检查依赖与配置         |
| `adb reverse tcp:8081 tcp:8081`         | 真机连接 Metro（USB）              |

## 目录结构

```text
src/
  adapters/       DeepSeek 协议类型、SSE 传输与解析、请求构造、错误文案；仓储与存储
  app/            应用入口（AppRoot）、导航装配
  config/         常量（存储键、超时、长度上限）与内置系统提示词
  domain/         对话/设置领域模型、引用、latest_reminder 与 env_info 快照
  features/       chatStore / settingsStore / chatEngine / chatRun / streamReducer
  ui/             主题、通用组件、primitives（含 DialogHost）、hooks、两个页面
  utils/          URL / 文本工具、剪贴板
__tests__/        SSE、归并、请求、引用、元信息、持久化、引擎与 store 测试
docs/             架构、API 集成、UI 系统与贡献规范
android/          expo prebuild 生成的原生工程（gitignore）
plugins/          Expo config plugins（Android SDK / NDK / CMake 版本）
```

## 配置项

| 设置          | 默认值                     | 说明                       |
| ------------- | -------------------------- | -------------------------- |
| Base URL      | `https://api.deepseek.com` | 可换成代理地址             |
| 模型          | `deepseek-flash`           | 文档推荐模型               |
| 深度思考      | 开                         | `thinking.type = enabled`  |
| 推理强度      | `high`                     | `low / high / max`         |
| 联网搜索      | 开                         | 声明 `deepseek_web_search` |
| 阅读链接      | 开                         | 声明 `deepseek_read_url`   |
| 内容安全      | `high`                     | `safety_check.level`       |
| 自动标题      | 开                         | 仅首轮请求开启 `title`     |
| 语言 / 所在地 | 中文 / 空                  | 写入 `latest_reminder`     |
| 附加提示词    | 空                         | 追加在内置系统提示词之后   |
| 主题          | 跟随系统                   | 浅色 / 深色                |

## 安全与合规

- 原生端使用 `expo-secure-store` 保存 API Key。Web 端的 API Key 仅存于当前页面内存。
- 对外提供服务时应开启 `safety_check`，并按 DeepSeek 开放平台协议履行内容审核、大模型登记与 AI 标识等义务。
- 模型输出仅供参考，应用内已提示「内容由 AI 生成」。

## 已知限制 / 下一步

- Android 为主目标；Web 可调试；iOS 尚未验证，需要 `expo prebuild --platform ios` 并提供 macOS/Xcode 环境。
- Web 端排版按移动窄屏设计，桌面浏览器下内容区会居中/拉伸，尚未做专门的自适应布局。
- 暂未支持文件上传（PDF/Word/图片）、语音输入与 TTS，接口层已按「内容块」建模，便于后续扩展。
- 暂未实现 Markdown Mermaid 图表、消息编辑、继续生成。
- 会话历史一次性写入，超长会话建议后续改为按消息分片存储。

## 文档

- [架构说明](docs/ARCHITECTURE.md)
- [DeepSeek API 集成说明](docs/DEEPSEEK_INTEGRATION.md)
- [UI 设计系统](docs/UI_SYSTEM.md)
- [代码规范与提交检查](docs/CONTRIBUTING.md)
