import type {
  CitationAnnotation,
  ServerToolEvent,
  ServerToolStep,
  Usage,
} from '../../domain/chat/types';
import type {ReasoningEffort, SafetyLevel} from '../../domain/settings/types';

/** OpenAI 兼容的 function calling 调用（客户端执行）。 */
export interface ApiToolCall {
  id: string;
  type: 'function';
  function: {name: string; arguments: string};
}

export type ApiMessage =
  | {role: 'system'; content: string}
  | {role: 'user'; content: string}
  | {role: 'latest_reminder'; content: string}
  | {
      role: 'assistant';
      content: string;
      reasoning_content?: string;
      server_tool_calls?: ServerToolStep[];
      tool_calls?: ApiToolCall[];
    }
  /** 客户端工具的返回值，必须紧跟触发它的 assistant.tool_calls。 */
  | {role: 'tool'; tool_call_id: string; content: string};

export interface ChatCompletionRequest {
  model: string;
  messages: ApiMessage[];
  stream: true;
  thinking?: {type: 'enabled' | 'disabled'};
  reasoning_effort?: ReasoningEffort;
  tools?: {type: 'deepseek_web_search' | 'deepseek_read_url'}[];
  safety_check?: {level: SafetyLevel};
  title?: {enabled: boolean};
  max_tokens?: number;
}

/** 流式 tool_calls 分片：只有第一个分片带 id / name。 */
export interface ApiToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {name?: string; arguments?: string};
}

export interface ChunkDelta {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  annotations?: CitationAnnotation[];
  server_tool_calls?: ServerToolStep[];
  tool_calls?: ApiToolCallDelta[];
  title?: string;
  refusal?: string | null;
}

export interface ChunkChoice {
  index: number;
  delta: ChunkDelta;
  finish_reason?:
    | 'stop'
    | 'length'
    | 'content_filter'
    | 'tool_calls'
    | string
    | null;
  server_tool_event?: ServerToolEvent | null;
}

export interface ChatCompletionChunk {
  id: string;
  object?: string;
  created?: number;
  model?: string;
  choices: ChunkChoice[];
  usage?: Usage | null;
  error?: {message?: string; type?: string; code?: string};
}
