# `code_exec` 客户端脚本工具

`code_exec` 让模型在本地编排文件工具，将批量读取、筛选和汇总的结果作为一条客户端工具消息返回。Android 和 iOS 在后台运行独立的 QuickJS，Web 和 Jest 使用 QuickJS WASM。各端共用脚本接口、文件工具校验和输出格式。

## 脚本接口

工具入参是 `{code: string}`，其中 `code` 是异步 JavaScript **函数体**。用 `await tools.call(name, args)` 调用工具，用 `return` 返回摘要或文件路径。下面的函数体查找工作区中的文本文件，并返回第一页路径和分页偏移。

```js
const {paths, next_offset} = await tools.call('find_files', {
  path: 'workspace/',
  pattern: '**/*.txt',
});
return {paths, next_offset};
```

- `tools.call()` 使用同名文件工具的参数对象，返回解析后的 JSON。调用失败时抛出 `Error`，脚本可以用 `try/catch` 处理。对每次工具调用使用 `await`，以便脚本在返回前拿到结果。
- 分页到 `next_offset` 或 `next_cursor` 为 `null` 时结束。搜索结果为空时，仍以 `next_cursor` 判断能否继续。`list_dir` / `find_files` 返回 `total`；`list_dir` 的文件项还包含 `size` 和 `mtime`（Web 端没有 `mtime`）。
- `search_text` 默认区分大小写，设置 `case_sensitive: false` 可忽略大小写。
- `read_file` 默认按 UTF-16 字符 `offset` 分页；传 `tail_lines` 可读取末尾 N 行，返回 `start_line` / `end_line`，此时 `next_offset` 为 `null`。
- 最终返回值需要能按 JSON 序列化。应用将字符串直接作为工具文本，将其他值转为 JSON 文本。省略 `return` 时结果为 `null`。

## 脚本环境

- 可用：`tools`、`TextEncoder` / `TextDecoder`（UTF-8）、`atob` / `btoa`、`queueMicrotask` 和受限的 `console.log/warn/error`。`tools.remainingCalls` 返回本次执行剩余的工具调用次数。
- 不可用：`setTimeout` / `setInterval`、`fetch`、`Intl`、`Buffer`、`require`、`process`。QuickJS 未链接 ICU，`toLocaleString()` 会忽略 locale 和 options，需要格式化时在脚本里手写或返回原始值。
- `console` 输出只保留最近 5 条，脚本失败时随错误消息返回；成功的脚本不会把这些日志回传给模型。
- 脚本异常消息会附带最近 8 次工具调用（成功/失败），便于定位失败点。`saved_paths` 仍由宿主在脚本写入后失败时补充。

## 调用链与访问边界

1. [`chatRun`](../src/features/chat/chatRun.ts) 收齐模型的客户端工具调用后，通过本轮工具快照执行 `code_exec`。[`toolDefinitions.ts`](../src/features/extensions/toolDefinitions.ts) 用同一份 Zod schema 生成工具声明并定义参数契约。
2. [`clientTools.ts`](../src/features/extensions/clientTools.ts) 为每次执行建立写入次数、写入字节数和已保存路径记录，把脚本、取消信号和各工具参数上限传给 `runJavaScript`。适配器在新建的 QuickJS 上下文中执行 [`scriptProgram.ts`](../src/adapters/js/scriptProgram.ts) 生成的程序。该程序将底层桥接函数封装在闭包中，并向脚本提供冻结的 `tools` 对象。
3. 脚本用 JSON 文本将工具名和参数传给宿主。`clientTools.ts` 使用同一份工具快照检查 `programmatic` 标记、参数大小和取消信号，再按工具的 schema 校验并执行。当前开放 `list_dir`、`find_files`、`search_text`、`read_file`、`write_file`、`delete_path` 和 `move_path`。`edit_file` 和 `read_image` 只供模型直接调用。文件访问经由宿主代理，范围为应用内的 `workspace/` 和启用的只读 `skills/`，写入、移动和删除限于 `workspace/`。`ask_user` 也只在模型直接调用时可用，脚本内无法提问。
4. 子调用结果在本机经桥接回到脚本。聊天层记录外层 `code_exec` 的结果，并按普通客户端工具结果回传。[`requestBuilder`](../src/adapters/api/requestBuilder.ts) 用已记录的调用和结果构造历史消息，脚本执行只发生在收到新调用时。消息格式见[客户端工具协议](DEEPSEEK_INTEGRATION.md#客户端工具function-calling)。

`write_file` 在脚本内返回 `{path}`。覆盖已有文件需要指定 `overwrite: true`。单次脚本执行最多完成 16 次 `write_file`、内容合计 1 MiB；相同内容的成功调用也占用次数，但内容未变化时不占字节。已完成的写入会保留。如果脚本随后失败且该失败被记录为工具结果，`FileToolError` 会附带 `saved_paths`。取消会停止等待工具结果，文件写入能否停止取决于取消发生时操作是否已经开始提交。 [文件操作](../src/features/extensions/fileOperations.ts) · [工具错误格式](../src/features/extensions/fileToolError.ts)

`delete_path` 只操作 `workspace/`，单文件默认删除；删除目录必须设置 `recursive: true`，并返回实际删除的 `{deleted, count}`。工作区根目录和 `skills/` 不允许删除。`move_path` 只移动文件，支持同目录重命名和跨目录移动；目标已存在时需要 `overwrite: true`，目录移动暂不支持。工具参数使用完整的应用内路径，例如 `workspace/notes.md` 或 `skills/<名称>/SKILL.md`。列出或搜索目录时可以用 `.` 表示应用内根目录。

## 平台实现与资源限制

| 平台       | 执行与构建入口                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android    | 本地 Expo 模块在 Kotlin 协程中用 QuickJS-KT 执行脚本。Gradle 依赖和 Kotlin 版本分别由[模块构建配置](../modules/code-exec/android/build.gradle)与 [Expo 配置插件](../plugins/withAndroidSdkVersions.js)维护。                                                                                                                       |
| iOS        | 本地 Expo 模块在每次执行的串行后台队列中调用 QuickJS C API，推进 Promise 任务并等待工具回复。CocoaPods 从[固定的 QuickJS 提交](../modules/code-exec/quickjs/MoreChatQuickJS.podspec)构建引擎，当前与 Android 的上游提交一致。 [执行器](../modules/code-exec/ios/QuickJSExecution.swift) · [配置插件](../plugins/withIosQuickJS.js) |
| Web / Jest | [WASM 执行器](../src/adapters/js/runJavaScript.ts)延迟加载浏览器 WASM 变体，复用模块加载结果。每次运行创建新上下文。Jest 显式将业务调用映射到同一实现。 [加载器](../src/adapters/js/loadQuickJS.ts) · [Jest 配置](../jest.config.js)                                                                                               |

Android 和 iOS 的应用运行时均为 Hermes。Metro 为原生端选择 [`runJavaScript.native.ts`](../src/adapters/js/runJavaScript.native.ts)。该适配器通过 [Expo 自动链接模块](../modules/code-exec/expo-module.config.json)调用 `MoreChatCodeExec.evaluate`，监听 `toolRequest`，并按 `runId` 和 `requestId` 回传 `reply`。超时和主动停止都会触发宿主侧的 `AbortSignal` 与原生 `cancel`。执行结束时释放运行时和监听器，迟到的工具结果由适配器丢弃。

所有业务限额以 [`appConfig.ts`](../src/config/appConfig.ts) 为准。当前脚本上限为 16,000 个 UTF-16 码元，序列化输出上限为 12,000 个，单次最多发起 64 次工具调用，`write_file` 最多 16 次且合计 1 MiB，`tail_lines` 最多 200 行。默认工具参数上限为 4,096 个码元，`write_file` 使用单独的参数上限以容纳转义后的文本，实际单个文件内容上限为 256 KiB。各端设置 5 秒执行总时限、8 MiB QuickJS 内存上限和 256 KiB 栈上限。Web 和 Jest 在 WASM 加载完成后开始计时，初次执行和每批 Promise 任务各有最多 100 毫秒的连续执行预算，并在任务批次之间让出线程。

## 修改与验证

- 修改脚本接口或增加可供脚本调用的工具时，从 `scriptProgram.ts` 或 `toolDefinitions.ts` 入手。新工具需要定义参数 schema、`programmatic` 标记和可解析的 JSON 文本结果。工具白名单和文件路径校验由宿主执行。
- 修改原生桥接时，同步核对 TypeScript、Android 和 iOS 的方法名、事件字段、执行标识和取消行为。更新 QuickJS 时，核对 QuickJS-KT 使用的上游提交与 iOS podspec 的提交及校验和。修改原生依赖后按 [README](../README.md) 重新生成或构建原生应用。出现「此应用构建不包含原生 JavaScript 执行模块」时，先确认当前安装的是包含本地 Expo 模块的构建。
- 用下列命令覆盖 WASM 执行、文件操作和 TypeScript 原生桥接逻辑。原生桥接测试使用模拟模块。

  ```sh
  pnpm test --runInBand __tests__/skillFiles.test.ts __tests__/runJavaScript.native.test.ts
  ```

- 用 `pnpm export:android`、`pnpm export:web` 和 `pnpm exec expo export --platform ios` 检查模块解析。原生模块改动还需要构建 Android Release APK 或 iOS 模拟器应用，实际运行简单返回值、`await tools.call()`、内存超限、死循环超时和取消等待中的工具。确认取消后的迟到回复不会影响下一次执行。 [Android 与 iOS 构建命令](../README.md)
