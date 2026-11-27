# AGENTS.md

MoreChat 是使用 TypeScript、React Native 和 Expo 构建的单包应用，Android 是主要目标，Web 用于调试。当前实现以源码为准，命令以 [`package.json`](package.json) 为准，构建与检查环境以 [CI 配置](.github/workflows/ci.yml) 和 [README](README.md) 为准。

## 工作流程

1. 编辑前运行 `git status --short`，检查涉及的文件和已有 diff。需要跨模块修改时，先说明改动范围、关键假设和验证方式。任务范围存在实质歧义时，先与用户确认。
2. 沿现有模块边界做最小改动。修改命令、工具或持久化契约时，先查调用方，并检查旧数据和回放路径是否仍可用。
3. 从最小有效验证开始，并按影响扩大范围。交付时说明实际通过、失败和未完成的检查。

## 工作树与 Git

- 默认视已有改动和工作期间出现的其他改动为用户所有。保留这些改动，避开无关文件。遇到无法绕开的重叠改动时，说明冲突并请用户处理。
- 修改完成后把改动留在工作区，等待用户审查。只有在用户明确要求时才暂存、提交或推送，并核对所选文件和片段。
- `git reset --hard`、`git checkout --` 等可能丢弃改动的操作需要用户明确授权。请求有歧义时先确认。
- 用户要求提交时，遵循 [提交规范与 Git hooks](docs/CONTRIBUTING.md)。`pre-commit` 会修复并重新暂存文件，部分暂存时在提交前后核对片段。保留正常钩子流程。遇到环境限制时，明确记录受影响的检查。

## 按任务查阅

- **界面、交互或主题**。修改前读 [DESIGN.md](DESIGN.md) 和 [UI 系统](docs/UI_SYSTEM.md)，优先复用 `src/ui/primitives` 与主题令牌，按设计规范验证受影响状态。
- **分层、会话、工具执行或持久化**。先读 [架构说明](docs/ARCHITECTURE.md)，再从 `src/features` 追踪状态与编排，从 `src/adapters` 核对协议、存储和平台实现。分层规则以 [`scripts/check-architecture.mjs`](scripts/check-architecture.mjs) 为准。
- **DeepSeek 请求、流式事件或工具回传**。先读 [DeepSeek 集成说明](docs/DEEPSEEK_INTEGRATION.md)，再核对请求构造、事件归并和历史回放的实现。
- **运行限额和默认时序**。以 [`src/config/appConfig.ts`](src/config/appConfig.ts) 为准。工具描述、错误提示及表单约束复用对应配置。
- **原生构建或平台配置**。先读 [README 的构建说明](README.md)，再核对 [`app.json`](app.json) 和 `plugins/`。`android/` 与 `ios/` 由 Expo Prebuild 生成，持久配置写在生成源中。

## 编辑指南

- 项目中的配置项常量，应在[appConfig.ts](src/config/appConfig.ts)中集中维护。

## 开发与验证

- 使用 Node.js 与 pnpm 执行仓库脚本。Node.js 最低版本见 `package.json` 的 `engines`，pnpm 版本与 CI 对齐。
- 文档改动用 `git diff --check` 与 `pnpm exec oxfmt --check <文件>` 验证，并核对新增的相对链接。
- 行为改动优先运行 `pnpm test --runInBand <测试文件>`，跨模块改动按需执行 `pnpm arch`、`pnpm typecheck` 或完整的 `pnpm check`。
- [CI](.github/workflows/ci.yml) 执行 Android 和 Web 的 Expo 导出。改动 Metro、运行时依赖或平台适配时，先在本地导出受影响的平台。需要确认设备行为时执行真机或模拟器验证，并在交付时区分导出与设备实测。
- `typecheck` 等短检查约 30 秒没有有效进展时，确认进程状态并停止挂起的命令。记录命令和未验证项，继续完成可运行的针对性检查。以退出状态判断已完成检查的结果。

## 何时更新本文件

工作流、验证入口或模块边界变化时，同步更新这里受影响的约定。
