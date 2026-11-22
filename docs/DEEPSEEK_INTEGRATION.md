# DeepSeek API 集成说明

参考：<https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot/>

## 请求

```json
{
  "model": "deepseek-flash",
  "messages": [
    {
      "role": "system",
      "content": "你是 More，一个运行在 MoreChat 应用中的智能助手。..."
    },
    {"role": "latest_reminder", "content": "2026-11-22,星期六,上海,App,中文"},
    {
      "role": "user",
      "content": "<env_info>\n客户端: MoreChat 0.1.0\n平台: App（Android）\n可用工具: 联网搜索、阅读链接\n</env_info>\n\n<user_query>\nDeepSeek 有什么更新？\n</user_query>"
    },
    {
      "role": "assistant",
      "content": "...",
      "reasoning_content": "...",
      "server_tool_calls": []
    }
  ],
  "stream": true,
  "thinking": {"type": "enabled"},
  "reasoning_effort": "high",
  "tools": [{"type": "deepseek_web_search"}, {"type": "deepseek_read_url"}],
  "safety_check": {"level": "high"},
  "title": {"enabled": true}
}
```

- 系统提示词固定在最前：`buildSystemPrompt` 把 `src/config/defaultSystemPrompt.ts` 的内置提示词与设置页内容拼成一条 `system` 消息，设置页内容为空时只发送内置提示词。
- `title` 只在会话首轮开启；标题在最后一个 chunk 的 `delta.title` 返回。
- `reasoning_effort` 仅在开启思考时发送。
- 关闭全部工具时不发送 `tools`。
- 声明工具/安全/标题后，服务端会忽略 `temperature`、`top_p` 等参数，客户端不设置它们。
- 历史 assistant 消息：带 `tools` 的请求必须回传 `reasoning_content` 和 `server_tool_calls`；失败/拒答轮次不回传。

## 系统提示词

`buildSystemPrompt(settings.systemPrompt)`（`src/config/defaultSystemPrompt.ts`）负责拼接：

1. 始终以 `getDefaultSystemPrompt()` 为基底，定义 More 的人格、书写风格与行动准则；
2. 设置页内容 trim 后非空时，追加 `## 用户附加提示词` 段，并用 `<configured_prompt>` 包裹；
3. 附加内容为空时直接返回内置提示词，不会残留空段落。

内置提示词里提到的 `<env_info>`、`<additional_context>`、`<attachments>`、`<user_query>` 属于「消息中可能携带」的正文标签。当前实现：

- `latest_reminder`：按官方「用户元信息标记」发送日期、星期、所在地、平台、语言，每条 user 消息前一条，并随历史回传。
- `<env_info>`：`buildEnvInfo` 在发送时生成，写入 `UserMessage.envInfo`，回放历史时保持当时的能力快照；只包含客户端版本、平台与可用工具，避免和 `latest_reminder` 重复同一事实。
- `<user_query>`：`composeUserContent` 把用户正文包起来；更早版本的会话没有 `envInfo` 时只包 query。
- `<attachments>`、`<additional_context>` 尚未实现，后续接入附件或工作区信息时按提示词约定扩展。

## 流式响应映射

| 服务端字段                            | 客户端处理                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `delta.reasoning_content`             | 追加到当前 thinking segment                                                      |
| `delta.content`                       | 追加到 text segment 与 `content`                                                 |
| `choice.server_tool_event`            | `step_reasoning_done` 关闭思考块；`call_started` / `call_completed` 更新工具卡片 |
| `delta.server_tool_calls`（末 chunk） | 合并为权威工具数据并写入 `reasoning`                                             |
| `delta.annotations`                   | 保存引用，渲染为角标                                                             |
| `delta.title`                         | 更新会话标题（用户手动命名时不覆盖）                                             |
| `delta.refusal`                       | 记录拒答说明                                                                     |
| `finish_reason`                       | `stop` 完成；`length` 标记截断；`content_filter` 进入拒答态                      |
| `usage`                               | 显示 token 用量                                                                  |

## 工具卡片

- `search` / `deep_search` / `image_search`：展示查询词与来源列表。
- `open_page` / `find_in_page`：展示网页标题、站点、查找词。
- `read_link`：展示被阅读链接的标题与域名。
- `status: failed` 时卡片标红。

搜索与抓取全部由服务端完成，客户端只需要声明工具并展示内容块；下一轮把 `server_tool_calls` 原样回传即可让服务端复用签名内容。

## 客户端工具（function calling）

服务端内置工具（`deepseek_web_search` / `deepseek_read_url`）由服务端执行，
客户端只负责声明与展示；**客户端工具**则由本机执行，走 OpenAI 兼容的
`tool_calls` 协议，两者并存且互不影响。

### 流式拼装

```jsonc
// assistant delta 分片：第一个带 id / name，后续只带 arguments 增量
{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function",
  "function":{"name":"get_weather","arguments":""}}]}}]}
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"city\":"}}]}}]}
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"上海\"}"}}]}}]}
{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}
```

- `applyStreamChunk` 按 `index` 回填、按 `id` 累加，写入
  `AssistantMessage.clientToolCalls`，同时镜像成一个 `client_tool` 时间线片段；
- 参数在拼完之前可能不是合法 JSON，用 `parseToolArguments` 解析，失败返回
  `null` 而不是抛错；
- `finish_reason: "tool_calls"` 把消息停在 `awaiting_tool`，等待执行后继续下一轮。

### 回传

客户端工具的结果必须紧跟触发它的 assistant 消息，否则服务端拒收：

```jsonc
{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function",
  "function":{"name":"get_weather","arguments":"{\"city\":\"上海\"}"}}]}
{"role":"tool","tool_call_id":"call_1","content":"晴，24℃"}
```

`requestBuilder` 只回传 `status: completed / failed` 的调用结果，仍在运行的不补
空结果；服务端工具仍按 `server_tool_calls` 原样回传以复用签名内容。

### 恢复

冷启动时不可能还有「运行中」的工具调用：持久化层会把 `running` 收尾成
`failed`、把整条消息从 `awaiting_tool` 收尾成 `aborted`，避免 UI 卡在加载态。

## 引用

`annotations[].url_citation` 的 `start_index`/`end_index` 以 **Unicode 码点**计数，而 JS 字符串按 UTF-16 计数。`citations.ts` 提供 `codePointIndexToCodeUnitIndex` 转换，并从后往前插入 `[n](morechat-citation:n)` 标记，避免偏移错乱；相同 URL 复用编号。

## 拒答

- 非流式：`content` 为空、`finish_reason=content_filter`；流式在最后一个 chunk 返回。
- 客户端收到后清空思考与正文（已流出的内容也会被移除），保留工具卡片，展示拒答文案。
- 输入命中审核时接口返回 `400 Content Exists Risk`，错误层会翻译成中文提示。

## 错误处理

| 状态     | 提示                     |
| -------- | ------------------------ |
| 400      | 参数错误或输入未通过审核 |
| 401      | API Key 无效             |
| 402      | 余额不足                 |
| 403      | API Key 无访问权限       |
| 404      | Base URL 错误            |
| 429      | 请求过于频繁             |
| 5xx      | 服务暂不可用             |
| 网络错误 | 检查网络后重试           |

## 传输实现说明

React Native 的 `fetch` 并非所有运行时都暴露可读流，因此使用 `XMLHttpRequest` 的增量 `responseText`：

1. `readyState >= 3` 时读取新增文本；
2. 交给 `SseParser` 按空行切分事件；
3. 解析 JSON chunk；
4. 收到 `[DONE]` 或连接结束即完成；
5. 通过 `AbortSignal`/句柄中止。

这样不依赖任何原生 SSE 库，且同时适用于新老架构。
