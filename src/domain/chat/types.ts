/**
 * 对话领域类型的稳定入口。
 *
 * 定义与运行时校验都在 `schema.ts`；这里只做类型重导出，避免调用方同时依赖
 * 两个路径。
 */
export type {
  AssistantMessage,
  AssistantSegment,
  AssistantToolRound,
  ChatMessage,
  CitationAnnotation,
  ClientToolCall,
  Conversation,
  ServerToolCall,
  ServerToolEvent,
  ServerToolStep,
  ToolSource,
  Usage,
  UserMessage,
} from './schema';
