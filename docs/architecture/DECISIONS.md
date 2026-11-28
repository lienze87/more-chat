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
