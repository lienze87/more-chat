import {DEFAULT_REFUSAL_MESSAGE} from '../../config/appConfig';
import type {
  ApiToolCallDelta,
  ChatCompletionChunk,
} from '../../adapters/api/types';
import type {
  AssistantMessage,
  AssistantSegment,
  ClientToolCall,
  ServerToolCall,
  ServerToolEvent,
  ServerToolStep,
} from '../../domain/chat/types';

export function createAssistantMessage(
  id: string,
  createdAt: number = Date.now(),
): AssistantMessage {
  return {
    id,
    role: 'assistant',
    createdAt,
    content: '',
    status: 'streaming',
    segments: [],
    reasoning: '',
    annotations: [],
    serverToolCalls: [],
    clientToolCalls: [],
    activeStep: 0,
  };
}

const segmentId = (messageId: string, segments: AssistantSegment[]): string =>
  `${messageId}-seg${segments.length}`;

function closeThinking(
  segments: AssistantSegment[],
  step?: number,
): AssistantSegment[] {
  const endedAt = Date.now();
  return segments.map(segment => {
    if (segment.kind !== 'thinking' || segment.done) {
      return segment;
    }
    if (step !== undefined && segment.step > step) {
      return segment;
    }
    return {...segment, done: true, endedAt};
  });
}

function appendReasoning(
  message: AssistantMessage,
  text: string,
): AssistantMessage {
  if (!text) {
    return message;
  }
  const segments = message.segments.slice();
  const last = segments[segments.length - 1];
  if (last && last.kind === 'thinking' && !last.done) {
    segments[segments.length - 1] = {...last, text: last.text + text};
  } else {
    segments.push({
      kind: 'thinking',
      id: segmentId(message.id, segments),
      step: message.activeStep,
      text,
      startedAt: Date.now(),
    });
  }
  return {...message, segments};
}

function appendContent(
  message: AssistantMessage,
  text: string,
): AssistantMessage {
  if (!text) {
    return message;
  }
  const last = message.segments[message.segments.length - 1];
  // 正文一旦开始，思考阶段就结束了；这里补一次收尾，避免标签一直停留在“思考中”。
  const segments =
    last && last.kind === 'thinking' && !last.done
      ? closeThinking(message.segments)
      : message.segments.slice();
  const previous = segments[segments.length - 1];
  if (previous && previous.kind === 'text') {
    segments[segments.length - 1] = {
      ...previous,
      text: previous.text + text,
    };
  } else {
    segments.push({
      kind: 'text',
      id: segmentId(message.id, segments),
      text,
    });
  }
  return {
    ...message,
    segments,
    content: message.content + text,
  };
}

function upsertToolCall(
  message: AssistantMessage,
  call: ServerToolCall,
  step: number,
): AssistantMessage {
  const segments = message.segments.slice();
  const index = segments.findIndex(
    segment => segment.kind === 'tool' && segment.id === call.id,
  );
  if (index >= 0) {
    const existing = segments[index];
    if (existing.kind === 'tool') {
      segments[index] = {
        ...existing,
        call: {...existing.call, ...call},
      };
    }
  } else {
    segments.push({
      kind: 'tool',
      id: call.id,
      step,
      call,
    });
  }
  return {...message, segments};
}

function applyToolEvent(
  message: AssistantMessage,
  event: ServerToolEvent,
): AssistantMessage {
  switch (event.type) {
    case 'step_reasoning_done': {
      const segments = closeThinking(message.segments, event.step);
      return {
        ...message,
        segments,
        activeStep: Math.max(message.activeStep, event.step + 1),
      };
    }
    case 'call_started': {
      const next = upsertToolCall(
        {...message, segments: closeThinking(message.segments)},
        event.call,
        event.step,
      );
      return {...next, activeStep: Math.max(next.activeStep, event.step)};
    }
    case 'call_completed': {
      return upsertToolCall(message, event.call, event.step);
    }
    default:
      return message;
  }
}

function applyServerToolCalls(
  message: AssistantMessage,
  steps: ServerToolStep[],
): AssistantMessage {
  if (!steps || steps.length === 0) {
    return message;
  }
  const segments = closeThinking(message.segments);
  for (const step of steps) {
    for (const call of step.calls ?? []) {
      const index = segments.findIndex(
        segment => segment.kind === 'tool' && segment.id === call.id,
      );
      if (index >= 0) {
        const existing = segments[index];
        if (existing.kind === 'tool') {
          segments[index] = {
            ...existing,
            call: {...existing.call, ...call},
          };
        }
      } else {
        segments.push({kind: 'tool', id: call.id, step: step.index, call});
      }
    }
  }

  const lastStep = steps[steps.length - 1];
  const reasoning =
    lastStep?.reasoning_content || deriveReasoning({...message, segments});

  return {...message, segments, serverToolCalls: steps, reasoning};
}

/** 同步维护 clientToolCalls 与时间线上的 client_tool 片段。 */
export function upsertClientToolCall(
  message: AssistantMessage,
  call: ClientToolCall,
): AssistantMessage {
  const calls = message.clientToolCalls.slice();
  const callIndex = calls.findIndex(item => item.id === call.id);
  if (callIndex >= 0) {
    calls[callIndex] = call;
  } else {
    calls.push(call);
    calls.sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  }

  const segments = message.segments.slice();
  const start = message.toolRounds?.at(-1)?.segmentEnd ?? 0;
  const segmentIndex = segments.findIndex(
    (segment, index) =>
      index >= start &&
      segment.kind === 'client_tool' &&
      segment.id === call.id,
  );
  const segment: AssistantSegment = {kind: 'client_tool', id: call.id, call};
  if (segmentIndex >= 0) {
    segments[segmentIndex] = segment;
  } else {
    segments.push(segment);
  }

  return {...message, clientToolCalls: calls, segments};
}

/**
 * 拼装流式 tool_calls 分片。
 *
 * 第一个分片带 id 与函数名，后续分片只带 arguments 的增量，因此按 index 回填、
 * 按 id 累加，期间保持 status=running。
 */
function applyToolCallDeltas(
  message: AssistantMessage,
  deltas: ApiToolCallDelta[],
): AssistantMessage {
  let next: AssistantMessage = {
    ...message,
    segments: closeThinking(message.segments),
  };
  for (const delta of deltas) {
    const base = delta.id
      ? next.clientToolCalls.find(item => item.id === delta.id)
      : next.clientToolCalls.find(item => item.index === delta.index);
    const id = delta.id ?? base?.id;
    if (!id) {
      // 没有 id 就无法把分片归到某次调用上，丢弃比猜更安全。
      continue;
    }
    next = upsertClientToolCall(next, {
      id,
      index: delta.index,
      name: base?.name || delta.function?.name || '',
      argumentsText:
        (base?.argumentsText ?? '') + (delta.function?.arguments ?? ''),
      status: 'running',
      result: base?.result,
      error: base?.error,
    });
  }
  return next;
}

export function deriveReasoning(message: AssistantMessage): string {
  const lastStep = message.serverToolCalls[message.serverToolCalls.length - 1];
  if (lastStep?.reasoning_content) {
    return lastStep.reasoning_content;
  }
  return message.segments
    .slice(message.toolRounds?.at(-1)?.segmentEnd ?? 0)
    .filter(
      (segment): segment is Extract<AssistantSegment, {kind: 'thinking'}> =>
        segment.kind === 'thinking',
    )
    .map(segment => segment.text)
    .join('');
}

export function applyFinishReason(
  message: AssistantMessage,
  finishReason: string | null | undefined,
): AssistantMessage {
  if (!finishReason) {
    return message;
  }

  if (finishReason === 'content_filter') {
    return {
      ...message,
      status: 'refused',
      content: '',
      reasoning: '',
      annotations: [],
      refusal: message.refusal || DEFAULT_REFUSAL_MESSAGE,
      segments: message.segments.filter(segment => segment.kind === 'tool'),
    };
  }

  if (finishReason === 'tool_calls') {
    // 模型要求调用客户端工具：消息停留在 awaiting_tool，由运行时执行后继续。
    return {
      ...message,
      status: 'awaiting_tool',
      segments: closeThinking(message.segments),
      reasoning: deriveReasoning(message),
    };
  }

  return {
    ...message,
    status: 'complete',
    segments: closeThinking(message.segments),
    truncated: finishReason === 'length',
    reasoning: deriveReasoning(message),
  };
}

export function applyStreamChunk(
  message: AssistantMessage,
  chunk: ChatCompletionChunk,
): AssistantMessage {
  let next = message;

  if (chunk.model && chunk.model !== next.model) {
    next = {...next, model: chunk.model};
  }
  if (chunk.usage) {
    next = {...next, usage: chunk.usage};
  }

  const choice = chunk.choices?.[0];
  if (!choice) {
    return next;
  }
  if (choice.server_tool_event) {
    next = applyToolEvent(next, choice.server_tool_event);
  }

  const delta = choice.delta ?? {};
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
    next = appendReasoning(next, delta.reasoning_content);
  }
  if (typeof delta.content === 'string' && delta.content) {
    next = appendContent(next, delta.content);
  }
  if (delta.server_tool_calls) {
    next = applyServerToolCalls(next, delta.server_tool_calls);
  }
  if (delta.tool_calls && delta.tool_calls.length > 0) {
    next = applyToolCallDeltas(next, delta.tool_calls);
  }
  if (delta.annotations) {
    next = {...next, annotations: delta.annotations};
  }
  if (delta.title) {
    next = {...next, title: delta.title};
  }
  if (delta.refusal) {
    next = {...next, refusal: delta.refusal};
  }
  if (choice.finish_reason) {
    next = applyFinishReason(next, choice.finish_reason);
  }

  return next;
}

export function markAborted(message: AssistantMessage): AssistantMessage {
  if (message.status === 'complete' || message.status === 'refused') {
    return message;
  }
  const next = markFailed(message, '工具调用已停止。');
  return {...next, error: undefined, status: 'aborted'};
}

export function continueAfterTools(
  message: AssistantMessage,
): AssistantMessage {
  return {
    ...message,
    status: 'streaming',
    toolRounds: [
      ...(message.toolRounds ?? []),
      {
        content: message.content,
        reasoning: message.reasoning,
        serverToolCalls: message.serverToolCalls,
        clientToolCalls: message.clientToolCalls,
        segmentEnd: message.segments.length,
      },
    ],
    content: '',
    reasoning: '',
    serverToolCalls: [],
    clientToolCalls: [],
    annotations: [],
    activeStep: 0,
    usage: undefined,
  };
}

export function markFailed(
  message: AssistantMessage,
  error: string,
): AssistantMessage {
  let next = message;
  for (const call of message.clientToolCalls) {
    if (call.status === 'running') {
      next = upsertClientToolCall(next, {...call, status: 'failed', error});
    }
  }
  return {
    ...next,
    status: 'error',
    error,
    segments: closeThinking(next.segments),
    reasoning: deriveReasoning(message),
  };
}
