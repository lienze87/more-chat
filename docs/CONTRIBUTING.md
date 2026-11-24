# 代码规范与提交检查

本项目在本地通过 Git hooks 做「提交前检查」，CI 上再跑一遍同样的检查，避免把
格式问题、类型错误或失败的测试带进主干。

## 本地检查

```bash
pnpm check          # format:check + lint + arch + typecheck + knip + test，一次跑完全部
pnpm format         # 用 oxfmt 格式化整个仓库
pnpm arch           # 检查循环依赖与分层倒置
pnpm knip           # 检查未使用的文件 / 导出 / 依赖
pnpm lint:staged    # 只检查已暂存的文件（pre-commit 内部调用）
```

| 命令                | 作用                                                   |
| ------------------- | ------------------------------------------------------ |
| `pnpm format`       | oxfmt 写入格式化结果                                   |
| `pnpm format:check` | 只检查不改写，CI 使用                                  |
| `pnpm lint`         | oxlint（correctness + React / TS / import / a11y）     |
| `pnpm arch`         | 循环依赖与分层倒置（`scripts/check-architecture.mjs`） |
| `pnpm typecheck`    | `tsc --noEmit` 全量类型检查                            |
| `pnpm knip`         | 未使用的文件、导出、类型与依赖（配置见 `knip.jsonc`）  |
| `pnpm test`         | Jest 单元测试                                          |
| `pnpm check`        | 以上六项串联                                           |

## Git hooks（husky）

`pnpm install` 会自动执行 `prepare` 脚本安装 hooks（`.husky/_` 由 husky 生成，
已被 gitignore）。

| 钩子         | 执行内容      | 作用                                                            |
| ------------ | ------------- | --------------------------------------------------------------- |
| `pre-commit` | `lint-staged` | 对暂存文件跑 `oxfmt --write` + `oxlint --fix`，并把修改重新暂存 |
| `commit-msg` | `commitlint`  | 校验提交信息是否符合约定式提交                                  |
| `pre-push`   | `typecheck`   | 推送前做一次全量类型检查                                        |

`lint-staged` 配置在 `package.json`：

```json
"lint-staged": {
  "*.{ts,tsx}": ["oxfmt --write", "oxlint --fix"],
  "*.{js,cjs,mjs,json,md,yml,yaml}": ["oxfmt --write"]
}
```

> 跳过检查只应在紧急情况下使用：`git commit --no-verify`。CI 仍会拦截，因此不要
> 把它当成常规操作。

## 工具配置

- `.oxlintrc.json`：启用的插件（eslint / react / typescript / import / jsx-a11y 等）、
  规则级别与忽略目录。默认只把 correctness 设为 error，suspicious / perf 为 warn。
- `scripts/check-architecture.mjs`：零依赖的架构门禁，规则表见
  `docs/ARCHITECTURE.md` 的「架构门禁」一节。新增分层规则时改这一个文件。
- `.oxfmtrc.json`：由原 Prettier 配置迁移而来，保持单引号、无括号内空格、80 列。
  `ignorePatterns` 已包含构建产物、锁文件与图片。
- 以下规则按运行时或场景显式关闭，改动前先确认约束仍成立：
  - `unicorn/no-array-sort`：列表可以原地排序刚创建的数组；
  - `eslint/no-await-in-loop`：`createThrottledSaver` 需要串行写盘；
  - `react/no-array-index-key`：消息时间线按位置生成、无稳定 id；
  - `jsx-a11y/no-autofocus`：重命名弹窗需要自动聚焦输入框。

## 常见问题

- **提示 `husky - pre-commit script failed`**：先看是哪个文件报了 oxlint 错误；
  修复后重新 `git add` 再提交。
- **新克隆的仓库 hooks 不生效**：执行一次 `pnpm install`（或 `pnpm exec husky`）。
- **Windows 下 hooks 报 `command not found`**：确认 `pnpm` 在 PATH 中；hooks 里
  使用的是 `pnpm exec`，不依赖全局安装的 husky。

## 提交信息规范（Conventional Commits）

格式：

```text
<type>(<scope>): <subject>

[body]

[footer]
```

`scope` 可选，`subject` 用中文或英文均可（`subject-case` 已关闭）。

| type       | 用途                         |
| ---------- | ---------------------------- |
| `feat`     | 新功能                       |
| `fix`      | 缺陷修复                     |
| `docs`     | 文档                         |
| `style`    | 只改格式（不影响逻辑）       |
| `refactor` | 重构（不是新功能也不是修复） |
| `perf`     | 性能优化                     |
| `test`     | 测试                         |
| `build`    | 构建 / 依赖                  |
| `ci`       | CI 配置                      |
| `chore`    | 杂项                         |
| `revert`   | 回滚                         |

示例：

```text
feat(ui): 统一设计令牌并引入 Ionicons 图标库

- 新增 src/ui/primitives 基础组件
- 页面改用 AppText / Card / Button 等组件
```

```text
fix(chat): 操作菜单里点击危险操作后对话框无法继续

dismiss 在回调执行前就把队列清空了，导致二次确认弹窗被丢弃。
```

校验命令：

```bash
pnpm commitlint              # 读取 .git/COMMIT_EDITMSG
echo "docs: 补充提交规范" | pnpm exec commitlint   # 直接校验一段文本
```

## 依赖规范

- 新增运行时依赖前先确认能否用现有能力实现；引入原生模块会导致 Expo Go 不可用。
- 先用 `pnpm exec expo install <pkg>` 安装 Expo 生态包，它会挑选与 SDK 58 匹配的
  版本。
- 新增依赖后提交更新后的 `pnpm-lock.yaml`；CI 使用 `--frozen-lockfile` 安装。
