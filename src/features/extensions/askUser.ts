import {create} from 'zustand';
import {z} from 'zod';
import {ASK_USER_LIMITS} from '../../config/appConfig';
import {parseToolArguments} from '../../domain/chat/toolCall';
import type {ClientToolCall} from '../../domain/chat/types';

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserPrompt {
  question: string;
  header?: string;
  options: AskUserOption[];
  multiSelect: boolean;
}

export interface AskUserAnswer {
  selected: string[];
  custom?: string;
  /** 用户未在时限内确认，工具按“未选择”继续。 */
  timedOut?: boolean;
}

export interface AskUserResult {
  question: string;
  selected: string[];
  custom: string | null;
  timedOut?: boolean;
}

/** 界面展示倒计时所需的提问状态。 */
export interface AskUserPending extends AskUserPrompt {
  callId: string;
  /** 绝对截止时间，界面用它与当前时间计算剩余秒数。 */
  expiresAt: number;
  timeoutMs: number;
  /** 用户正在输入自定义回答时暂停计时。 */
  paused: boolean;
  /** 暂停时冻结的剩余毫秒数。 */
  remainingMs: number;
}

interface PendingAskUser extends AskUserPending {
  resolve: (answer: AskUserAnswer) => void;
  reject: (error: Error) => void;
  pause: () => void;
  resume: () => void;
}

interface AskUserState {
  /** 正在等待用户回答的提问，按工具调用 id 索引。 */
  pending: Record<string, PendingAskUser>;
  submit: (callId: string, answer: AskUserAnswer) => void;
  cancel: (callId: string) => void;
  /** 超时后按“未选择”结束，让对话继续。 */
  expire: (callId: string) => void;
  /** 用户聚焦自定义输入框时暂停计时。 */
  pause: (callId: string) => void;
  /** 用户离开输入框时恢复计时。 */
  resume: (callId: string) => void;
}

const removed = <T extends Record<string, PendingAskUser>>(
  pending: T,
  callId: string,
): T => {
  const next = {...pending};
  delete next[callId];
  return next;
};

/**
 * 提问队列。
 *
 * `ask_user` 工具执行时在这里登记一个 Promise，界面提交答案或本轮取消后
 * 才继续；未回答的提问只存在于内存中，冷启动后会由持久化层统一收尾。
 */
export const useAskUserStore = create<AskUserState>()((set, get) => ({
  pending: {},

  submit: (callId, answer) => {
    const pending = get().pending[callId];
    if (!pending) {
      return;
    }
    set(state => ({pending: removed(state.pending, callId)}));
    pending.resolve(answer);
  },

  cancel: callId => {
    const pending = get().pending[callId];
    if (!pending) {
      return;
    }
    set(state => ({pending: removed(state.pending, callId)}));
    pending.reject(new Error('提问已取消。'));
  },

  expire: callId => {
    const pending = get().pending[callId];
    if (!pending) {
      return;
    }
    set(state => ({pending: removed(state.pending, callId)}));
    pending.resolve({selected: [], timedOut: true});
  },

  pause: callId => {
    get().pending[callId]?.pause();
  },

  resume: callId => {
    get().pending[callId]?.resume();
  },
}));

/**
 * 向用户提问并等待选择。
 *
 * 工具层只拿到 `callId` 与取消信号：取消时从队列移除并 reject，避免界面
 * 留下无法回答的卡片；超时则按“未选择”resolve，让模型继续推进；迟到提交
 * 由 `submit` 的队列检查丢弃。
 */
export function requestUserAnswer(
  callId: string,
  prompt: AskUserPrompt,
  signal: AbortSignal,
  timeoutMs: number = ASK_USER_LIMITS.timeoutMs,
): Promise<AskUserAnswer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (answer: AskUserAnswer) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal.removeEventListener('abort', onAbort);
      resolve(answer);
    };
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal.removeEventListener('abort', onAbort);
      reject(error);
    };
    const onAbort = () => useAskUserStore.getState().cancel(callId);

    if (signal.aborted) {
      fail(new Error('提问已取消。'));
      return;
    }

    let expiresAt = Date.now() + timeoutMs;
    let remainingMs = timeoutMs;
    let paused = false;

    const updatePending = (
      patch: Partial<
        Pick<AskUserPending, 'expiresAt' | 'paused' | 'remainingMs'>
      >,
    ) => {
      useAskUserStore.setState(state => {
        const current = state.pending[callId];
        if (!current) {
          return state;
        }
        return {
          pending: {
            ...state.pending,
            [callId]: {...current, ...patch},
          },
        };
      });
    };

    const pause = () => {
      if (settled || paused) {
        return;
      }
      paused = true;
      remainingMs = Math.max(0, expiresAt - Date.now());
      if (timeout !== undefined) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      updatePending({paused: true, remainingMs});
    };

    const resume = () => {
      if (settled || !paused) {
        return;
      }
      paused = false;
      if (remainingMs <= 0) {
        useAskUserStore.getState().expire(callId);
        return;
      }
      expiresAt = Date.now() + remainingMs;
      updatePending({paused: false, expiresAt, remainingMs});
      timeout = setTimeout(() => {
        useAskUserStore.getState().expire(callId);
      }, remainingMs);
    };

    useAskUserStore.setState(state => ({
      pending: {
        ...state.pending,
        [callId]: {
          ...prompt,
          callId,
          expiresAt,
          timeoutMs,
          paused: false,
          remainingMs,
          resolve: finish,
          reject: fail,
          pause,
          resume,
        },
      },
    }));
    signal.addEventListener('abort', onAbort, {once: true});
    timeout = setTimeout(() => {
      useAskUserStore.getState().expire(callId);
    }, timeoutMs);
  });
}

const promptText = z.string({error: '必须是字符串。'}).trim();

export const askUserSchema = z.strictObject({
  question: promptText
    .min(1, '不能为空。')
    .max(ASK_USER_LIMITS.maxQuestionLength)
    .describe('向用户提出的问题：说明需要决定什么，以及不同选择的后果'),
  header: promptText
    .min(1, '不能为空。')
    .max(ASK_USER_LIMITS.maxHeaderLength)
    .optional()
    .describe('可选短标题，例如“保存位置”或“发布方式”'),
  options: z
    .array(
      z.strictObject({
        label: promptText
          .min(1, '不能为空。')
          .max(ASK_USER_LIMITS.maxOptionLabelLength)
          .describe('选项名称，尽量简短'),
        description: promptText
          .max(ASK_USER_LIMITS.maxOptionDescriptionLength)
          .optional()
          .describe('该选项影响的简短说明'),
      }),
      {error: '需要提供选项。'},
    )
    .min(2, '至少提供两个选项。')
    .max(ASK_USER_LIMITS.maxOptions)
    .refine(
      items => new Set(items.map(item => item.label)).size === items.length,
      '选项不能重复。',
    )
    .describe('2–4 个互不相同的决策选项'),
  multi_select: z
    .boolean()
    .default(false)
    .describe('允许一次选择多个选项时设为 true'),
});

export function toAskUserPrompt({
  multi_select,
  ...prompt
}: z.output<typeof askUserSchema>): AskUserPrompt {
  return {...prompt, multiSelect: multi_select};
}

/** 从完整有效的工具参数还原提问卡片。 */
export function parseAskUserPrompt(
  call: Pick<ClientToolCall, 'argumentsText'>,
): AskUserPrompt | null {
  const parsed = askUserSchema.safeParse(parseToolArguments(call));
  return parsed.success ? toAskUserPrompt(parsed.data) : null;
}

/** 解析工具结果，用于回答后的静态展示。 */
export function parseAskUserResult(
  result: string | undefined,
): AskUserResult | null {
  if (!result) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(result);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const selected = Array.isArray(record.selected)
      ? record.selected.filter(
          (item): item is string => typeof item === 'string' && !!item,
        )
      : [];
    const custom =
      typeof record.custom === 'string' && record.custom.trim()
        ? record.custom
        : null;
    const timedOut = record.timed_out === true;
    if (!selected.length && !custom && !timedOut) {
      return null;
    }
    return {
      question: typeof record.question === 'string' ? record.question : '',
      selected,
      custom,
      ...(timedOut ? {timedOut: true} : {}),
    };
  } catch {
    return null;
  }
}
