import type {
  AssistantMessage,
  AssistantSegment,
  ClientToolCall,
  ServerToolCall,
} from '../../domain/chat/types';

export type ThinkingBlock = {
  kind: 'thinking';
  text: string;
  streaming: boolean;
  startedAt: number;
  endedAt?: number;
};

export type AssistantBlock =
  | ThinkingBlock
  | {kind: 'tool'; call: ServerToolCall}
  | {kind: 'client_tool'; call: ClientToolCall}
  | {kind: 'text'; text: string; segmentIndex: number};

export type ProcessStep = Extract<AssistantBlock, {kind: 'thinking' | 'tool'}>;

export type DisplayBlock =
  | AssistantBlock
  | {kind: 'process'; steps: ProcessStep[]};

type ThinkingSegment = Extract<AssistantSegment, {kind: 'thinking'}>;

/**
 * 把正文前的思考与工具步骤折叠成一组。
 *
 * 只有出现工具时才生成 `process` 分组；纯思考仍按普通块渲染，避免把“思考”
 * 误包装成“联网过程”。
 */
export function groupToolProcess(blocks: AssistantBlock[]): DisplayBlock[] {
  const grouped: DisplayBlock[] = [];
  let steps: ProcessStep[] = [];

  const flush = () => {
    if (steps.some(step => step.kind === 'tool')) {
      grouped.push({kind: 'process', steps});
    } else {
      grouped.push(...steps);
    }
    steps = [];
  };

  for (const block of blocks) {
    if (block.kind === 'thinking' || block.kind === 'tool') {
      steps.push(block);
    } else {
      flush();
      grouped.push(block);
    }
  }
  flush();
  return grouped;
}

/** 合并相邻 thinking 片段，并保留工具、客户端工具与正文的时间线顺序。 */
export function toBlocks(message: AssistantMessage): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let thinking: ThinkingSegment[] = [];

  const flushThinking = () => {
    if (thinking.length === 0) {
      return;
    }
    const last = thinking[thinking.length - 1];
    const startedAt = thinking[0].startedAt;
    let endedAt: number | undefined;
    for (const segment of thinking) {
      if (segment.endedAt !== undefined) {
        endedAt = segment.endedAt;
      }
    }
    blocks.push({
      kind: 'thinking',
      text: thinking.map(segment => segment.text).join('\n\n'),
      streaming: last.done !== true,
      startedAt,
      endedAt,
    });
    thinking = [];
  };

  for (const [segmentIndex, segment] of message.segments.entries()) {
    if (segment.kind === 'thinking') {
      thinking.push(segment);
      continue;
    }
    flushThinking();
    if (segment.kind === 'tool') {
      blocks.push({kind: 'tool', call: segment.call});
    } else if (segment.kind === 'client_tool') {
      blocks.push({kind: 'client_tool', call: segment.call});
    } else if (segment.kind === 'text') {
      blocks.push({kind: 'text', text: segment.text, segmentIndex});
    }
  }
  flushThinking();
  return blocks;
}
