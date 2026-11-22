import {STORAGE_KEYS} from '../../../config/appConfig';
import type {
  AssistantMessage,
  ChatMessage,
  ClientToolCall,
  Conversation,
  MessageStatus,
  ServerToolCall,
  ServerToolStep,
} from '../../../domain/chat/types';
import {readJson, writeJson} from '../storage/jsonStorage';

const MESSAGE_STATUSES = new Set<MessageStatus>([
  'streaming',
  'awaiting_tool',
  'complete',
  'error',
  'aborted',
  'refused',
]);

const TOOL_CALL_STATUSES = new Set<ClientToolCall['status']>([
  'running',
  'completed',
  'failed',
]);

const normalizeStatus = (value: unknown): MessageStatus =>
  MESSAGE_STATUSES.has(value as MessageStatus)
    ? (value as MessageStatus)
    : 'complete';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function normalizeClientToolCall(raw: unknown): ClientToolCall | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') {
    return null;
  }
  const rawStatus = raw.status as ClientToolCall['status'];
  const status = TOOL_CALL_STATUSES.has(rawStatus) ? rawStatus : 'failed';
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    argumentsText:
      typeof raw.argumentsText === 'string' ? raw.argumentsText : '',
    // 冷启动后不可能还有“正在运行”的工具调用，按失败收尾，避免卡在运行中。
    status: status === 'running' ? 'failed' : status,
    result: typeof raw.result === 'string' ? raw.result : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

function normalizeMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') {
    return null;
  }
  const createdAt =
    typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();

  if (raw.role === 'user') {
    return {
      id: raw.id,
      role: 'user',
      content: typeof raw.content === 'string' ? raw.content : '',
      createdAt,
      status: 'complete',
      reminder: typeof raw.reminder === 'string' ? raw.reminder : undefined,
      envInfo: typeof raw.envInfo === 'string' ? raw.envInfo : undefined,
    };
  }

  if (raw.role !== 'assistant') {
    return null;
  }

  const segments = Array.isArray(raw.segments)
    ? raw.segments
        .filter(isRecord)
        .map((segment, index) => {
          if (segment.kind === 'thinking') {
            return {
              kind: 'thinking' as const,
              id:
                typeof segment.id === 'string'
                  ? segment.id
                  : `restored-thinking-${index}`,
              step: typeof segment.step === 'number' ? segment.step : 0,
              text: typeof segment.text === 'string' ? segment.text : '',
              done: segment.done === true,
              startedAt:
                typeof segment.startedAt === 'number'
                  ? segment.startedAt
                  : undefined,
              endedAt:
                typeof segment.endedAt === 'number'
                  ? segment.endedAt
                  : undefined,
            };
          }
          if (segment.kind === 'tool') {
            return {
              kind: 'tool' as const,
              id:
                typeof segment.id === 'string'
                  ? segment.id
                  : `restored-tool-${index}`,
              step: typeof segment.step === 'number' ? segment.step : 0,
              call: (segment.call ?? {}) as ServerToolCall,
            };
          }
          if (segment.kind === 'client_tool') {
            const call = normalizeClientToolCall(segment.call);
            if (!call) {
              return null;
            }
            return {kind: 'client_tool' as const, id: call.id, call};
          }
          return {
            kind: 'text' as const,
            id:
              typeof segment.id === 'string'
                ? segment.id
                : `restored-text-${index}`,
            text: typeof segment.text === 'string' ? segment.text : '',
          };
        })
        .filter(
          (segment): segment is NonNullable<typeof segment> => segment !== null,
        )
    : [];

  const assistant: AssistantMessage = {
    id: raw.id,
    role: 'assistant',
    content: typeof raw.content === 'string' ? raw.content : '',
    createdAt,
    status: normalizeStatus(raw.status),
    segments: segments as AssistantMessage['segments'],
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    annotations: Array.isArray(raw.annotations)
      ? (raw.annotations as AssistantMessage['annotations'])
      : [],
    serverToolCalls: Array.isArray(raw.serverToolCalls)
      ? (raw.serverToolCalls as ServerToolStep[])
      : [],
    clientToolCalls: Array.isArray(raw.clientToolCalls)
      ? raw.clientToolCalls
          .map(normalizeClientToolCall)
          .filter((call): call is ClientToolCall => call !== null)
      : [],
    activeStep: typeof raw.activeStep === 'number' ? raw.activeStep : 0,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    refusal: typeof raw.refusal === 'string' ? raw.refusal : undefined,
    truncated: raw.truncated === true,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    usage: isRecord(raw.usage)
      ? (raw.usage as AssistantMessage['usage'])
      : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
  // Interrupted streams should not block the UI on an endless spinner.
  if (
    assistant.status === 'streaming' ||
    assistant.status === 'awaiting_tool'
  ) {
    assistant.status = 'aborted';
  }
  return assistant;
}

function normalizeConversation(raw: unknown): Conversation | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') {
    return null;
  }
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .map(normalizeMessage)
        .filter((message): message is ChatMessage => message !== null)
    : [];
  const createdAt =
    typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  return {
    id: raw.id,
    title:
      typeof raw.title === 'string' && raw.title ? raw.title : '未命名对话',
    titleSource:
      raw.titleSource === 'user' || raw.titleSource === 'auto'
        ? raw.titleSource
        : 'fallback',
    createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt,
    messages,
  };
}

export const conversationRepository = {
  async load(): Promise<Conversation[]> {
    const raw = await readJson<unknown>(STORAGE_KEYS.conversations, []);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map(normalizeConversation)
      .filter(
        (conversation): conversation is Conversation => conversation !== null,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async save(conversations: Conversation[]): Promise<void> {
    await writeJson(STORAGE_KEYS.conversations, conversations);
  },
};
