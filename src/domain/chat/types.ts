/**
 * Domain types for the chat experience.
 *
 * The shape mirrors DeepSeek's Chat Completions extensions
 * (thinking, server-side web tools, citations, title, safety).
 */

export type ToolKind =
  | 'search'
  | 'deep_search'
  | 'read_link'
  | 'image_search'
  | 'deep_image_search';

export type ToolAction = {
  type: string;
  [key: string]: unknown;
};

export interface ToolSource {
  type?: string;
  url: string;
  title?: string;
  snippet?: string;
  site_name?: string;
  site_icon?: string;
  published_at?: string;
  image_url?: string;
}

export interface ToolPage {
  url: string;
  title?: string | null;
  published_at?: string | null;
}

export interface ServerToolCall {
  index: number;
  id: string;
  type: 'deepseek_web_search' | 'deepseek_read_url' | string;
  kind: ToolKind | string;
  action: ToolAction;
  status?: 'completed' | 'failed' | string;
  sources?: ToolSource[];
  page?: ToolPage;
  signature?: string;
  error?: {code?: string};
}

export interface ServerToolStep {
  index: number;
  reasoning_content?: string;
  calls: ServerToolCall[];
}

export type ServerToolEvent =
  | {type: 'step_reasoning_done'; step: number}
  | {type: 'call_started'; step: number; call: ServerToolCall}
  | {type: 'call_completed'; step: number; call: ServerToolCall};

/**
 * 客户端工具（function calling）的一次调用。
 *
 * 与服务端内置工具分开建模：`serverToolCalls` 是服务端执行的步骤，需要原样
 * 回传 `server_tool_calls` 以复用签名；`ClientToolCall` 由本机执行，回传时
 * 走 OpenAI 兼容的 `tool_calls` + `tool` 消息。
 */
export interface ClientToolCall {
  id: string;
  /** 模型流内的索引，用于匹配交错到达的参数分片。 */
  index?: number;
  name: string;
  /** 流式期间持续拼接的 JSON 片段，执行前用 parseToolArguments 解析。 */
  argumentsText: string;
  status: 'running' | 'completed' | 'failed';
  /** 发给模型的工具结果，包含文件工具返回的结构化错误。 */
  result?: string;
  /** 失败时用于展示的错误说明。 */
  error?: string;
}

export interface CitationAnnotation {
  type: 'url_citation';
  url_citation: {
    url: string;
    title?: string;
    start_index: number;
    end_index: number;
  };
}

/** Ordered pieces of an assistant answer, as rendered by the UI. */
export type AssistantSegment =
  | {
      kind: 'thinking';
      id: string;
      step: number;
      text: string;
      done?: boolean;
      /** 思考开始的绝对时间，用于在标签上显示计时。 */
      startedAt: number;
      /** 思考结束的绝对时间；仍在生成时为空。 */
      endedAt?: number;
    }
  | {kind: 'tool'; id: string; step: number; call: ServerToolCall}
  | {kind: 'client_tool'; id: string; call: ClientToolCall}
  | {kind: 'text'; id: string; text: string};

export type MessageStatus =
  | 'streaming'
  /** 模型要求调用客户端工具，等待本机执行后继续下一轮。 */
  | 'awaiting_tool'
  | 'complete'
  | 'error'
  | 'aborted'
  | 'refused';

interface BaseMessage {
  id: string;
  createdAt: number;
  content: string;
  status: MessageStatus;
  error?: string;
}

export interface UserMessage extends BaseMessage {
  role: 'user';
  /** Value of the latest_reminder message sent right before this message. */
  reminder: string;
  /** 发送时写入的 `<env_info>` 快照。 */
  envInfo: string;
}

/** 一次客户端工具调用前的独立模型响应，供 API 按原顺序回放。 */
export interface AssistantToolRound {
  content: string;
  reasoning: string;
  serverToolCalls: ServerToolStep[];
  clientToolCalls: ClientToolCall[];
  segmentEnd: number;
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  segments: AssistantSegment[];
  /** Reasoner output kept for replay (last step when tools are used). */
  reasoning: string;
  annotations: CitationAnnotation[];
  serverToolCalls: ServerToolStep[];
  clientToolCalls: ClientToolCall[];
  toolRounds?: AssistantToolRound[];
  /** Step that the next reasoning delta belongs to. */
  activeStep: number;
  title?: string;
  refusal?: string;
  truncated?: boolean;
  model?: string;
  usage?: Usage;
}

export type ChatMessage = UserMessage | AssistantMessage;

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    safety_tokens?: number;
    reasoning_tokens?: number;
  };
  prompt_tokens_details?: {cached_tokens?: number};
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
    tool_search?: number;
    tool_fetch?: number;
    tool_image_search?: number;
  };
}

export type TitleSource = 'auto' | 'user' | 'fallback';

export interface Conversation {
  id: string;
  title: string;
  titleSource: TitleSource;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
