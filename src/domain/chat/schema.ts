import {z} from 'zod';

/**
 * 对话模型与持久化契约的唯一权威定义。
 *
 * 运行时校验（冷启动读取）和 TypeScript 类型都从这些 schema 派生；新增字段时
 * 先改这里，仓储与 UI 会同时得到约束。
 */

const toolActionSchema = z.object({type: z.string()}).catchall(z.unknown());

const toolSourceSchema = z.object({
  type: z.string().optional(),
  url: z.string(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  site_name: z.string().optional(),
  site_icon: z.string().optional(),
  published_at: z.string().optional(),
  image_url: z.string().optional(),
});
export type ToolSource = z.infer<typeof toolSourceSchema>;

const toolPageSchema = z.object({
  url: z.string(),
  title: z.string().nullish(),
  published_at: z.string().nullish(),
});

const serverToolCallSchema = z.object({
  index: z.number(),
  id: z.string(),
  type: z.string(),
  kind: z.string(),
  action: toolActionSchema,
  status: z.string().optional(),
  sources: z.array(toolSourceSchema).optional(),
  page: toolPageSchema.optional(),
  signature: z.string().optional(),
  error: z.object({code: z.string().optional()}).optional(),
});
export type ServerToolCall = z.infer<typeof serverToolCallSchema>;

const serverToolStepSchema = z.object({
  index: z.number(),
  reasoning_content: z.string().optional(),
  calls: z.array(serverToolCallSchema),
});
export type ServerToolStep = z.infer<typeof serverToolStepSchema>;

const serverToolEventSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('step_reasoning_done'), step: z.number()}),
  z.object({
    type: z.literal('call_started'),
    step: z.number(),
    call: serverToolCallSchema,
  }),
  z.object({
    type: z.literal('call_completed'),
    step: z.number(),
    call: serverToolCallSchema,
  }),
]);
export type ServerToolEvent = z.infer<typeof serverToolEventSchema>;

const clientToolCallSchema = z.object({
  id: z.string(),
  index: z.number().optional(),
  name: z.string(),
  argumentsText: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  result: z.string().optional(),
  error: z.string().optional(),
});
export type ClientToolCall = z.infer<typeof clientToolCallSchema>;

const citationAnnotationSchema = z.object({
  type: z.literal('url_citation'),
  url_citation: z.object({
    url: z.string(),
    title: z.string().optional(),
    start_index: z.number(),
    end_index: z.number(),
  }),
});
export type CitationAnnotation = z.infer<typeof citationAnnotationSchema>;

const thinkingSegmentSchema = z.object({
  kind: z.literal('thinking'),
  id: z.string(),
  step: z.number(),
  text: z.string(),
  done: z.boolean().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
});

const toolSegmentSchema = z.object({
  kind: z.literal('tool'),
  id: z.string(),
  step: z.number(),
  call: serverToolCallSchema,
});

const clientToolSegmentSchema = z.object({
  kind: z.literal('client_tool'),
  id: z.string(),
  call: clientToolCallSchema,
});

const textSegmentSchema = z.object({
  kind: z.literal('text'),
  id: z.string(),
  text: z.string(),
});

const assistantSegmentSchema = z.discriminatedUnion('kind', [
  thinkingSegmentSchema,
  toolSegmentSchema,
  clientToolSegmentSchema,
  textSegmentSchema,
]);
export type AssistantSegment = z.infer<typeof assistantSegmentSchema>;

const messageStatusSchema = z.enum([
  'streaming',
  'awaiting_tool',
  'complete',
  'error',
  'aborted',
  'refused',
]);

const usageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  completion_tokens_details: z
    .object({
      safety_tokens: z.number().optional(),
      reasoning_tokens: z.number().optional(),
    })
    .optional(),
  prompt_tokens_details: z
    .object({cached_tokens: z.number().optional()})
    .optional(),
  server_tool_use: z
    .object({
      web_search_requests: z.number().optional(),
      web_fetch_requests: z.number().optional(),
      tool_search: z.number().optional(),
      tool_fetch: z.number().optional(),
      tool_image_search: z.number().optional(),
    })
    .optional(),
});
export type Usage = z.infer<typeof usageSchema>;

const baseMessageSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  content: z.string(),
  status: messageStatusSchema,
  error: z.string().optional(),
});

const userMessageSchema = baseMessageSchema.extend({
  role: z.literal('user'),
  reminder: z.string(),
  envInfo: z.string(),
});
export type UserMessage = z.infer<typeof userMessageSchema>;

const assistantToolRoundSchema = z.object({
  content: z.string(),
  reasoning: z.string(),
  serverToolCalls: z.array(serverToolStepSchema),
  clientToolCalls: z.array(clientToolCallSchema),
  segmentEnd: z.number(),
});
export type AssistantToolRound = z.infer<typeof assistantToolRoundSchema>;

const assistantMessageSchema = baseMessageSchema.extend({
  role: z.literal('assistant'),
  segments: z.array(assistantSegmentSchema),
  reasoning: z.string(),
  annotations: z.array(citationAnnotationSchema),
  serverToolCalls: z.array(serverToolStepSchema),
  clientToolCalls: z.array(clientToolCallSchema),
  toolRounds: z.array(assistantToolRoundSchema).optional(),
  activeStep: z.number(),
  title: z.string().optional(),
  refusal: z.string().optional(),
  truncated: z.boolean().optional(),
  model: z.string().optional(),
  usage: usageSchema.optional(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

const chatMessageSchema = z.discriminatedUnion('role', [
  userMessageSchema,
  assistantMessageSchema,
]);
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleSource: z.enum(['auto', 'user', 'fallback']),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(chatMessageSchema),
});
export type Conversation = z.infer<typeof conversationSchema>;
