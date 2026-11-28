import type {
  AssistantMessage,
  AssistantSegment,
} from '../src/domain/chat/types';
import {createAssistantMessage} from '../src/features/chat/streamReducer';
import {
  groupToolProcess,
  toBlocks,
} from '../src/ui/components/assistantTimeline';

const message = (segments: AssistantSegment[]): AssistantMessage => ({
  ...createAssistantMessage('m1', 1),
  segments,
});

const toolCall = {
  index: 0,
  id: 'search_1',
  type: 'deepseek_web_search',
  kind: 'search',
  action: {type: 'search', queries: ['天气']},
  status: 'completed',
};

describe('toBlocks', () => {
  it('merges adjacent thinking segments and keeps their duration', () => {
    const blocks = toBlocks(
      message([
        {
          kind: 'thinking',
          id: 't1',
          step: 0,
          text: '先想',
          startedAt: 10,
        },
        {
          kind: 'thinking',
          id: 't2',
          step: 0,
          text: '再想',
          done: true,
          startedAt: 10,
          endedAt: 20,
        },
        {kind: 'text', id: 'x', text: '答案'},
      ]),
    );

    expect(blocks).toEqual([
      {
        kind: 'thinking',
        text: '先想\n\n再想',
        streaming: false,
        startedAt: 10,
        endedAt: 20,
      },
      {kind: 'text', text: '答案', segmentIndex: 2},
    ]);
  });

  it('keeps thinking around a tool as separate blocks', () => {
    const blocks = toBlocks(
      message([
        {kind: 'thinking', id: 't1', step: 0, text: 'a', startedAt: 1},
        {kind: 'tool', id: 'search_1', step: 0, call: toolCall},
        {kind: 'thinking', id: 't2', step: 1, text: 'b', startedAt: 2},
        {kind: 'text', id: 'x', text: '答案'},
      ]),
    );

    expect(blocks.map(block => block.kind)).toEqual([
      'thinking',
      'tool',
      'thinking',
      'text',
    ]);
  });

  it('marks an unfinished thinking segment as streaming', () => {
    const [thinking] = toBlocks(
      message([
        {kind: 'thinking', id: 't1', step: 0, text: '思考中', startedAt: 1},
      ]),
    );

    expect(thinking).toMatchObject({kind: 'thinking', streaming: true});
  });

  it('preserves client tool segments in timeline order', () => {
    const blocks = toBlocks(
      message([
        {kind: 'text', id: 'x', text: '先说明'},
        {
          kind: 'client_tool',
          id: 'call_1',
          call: {
            id: 'call_1',
            name: 'read_file',
            argumentsText: '{}',
            status: 'completed',
          },
        },
      ]),
    );

    expect(blocks.map(block => block.kind)).toEqual(['text', 'client_tool']);
  });
});

describe('groupToolProcess', () => {
  it('groups thinking and tools before the answer into one process', () => {
    const blocks = toBlocks(
      message([
        {kind: 'thinking', id: 't1', step: 0, text: '搜索一下', startedAt: 1},
        {kind: 'tool', id: 'search_1', step: 0, call: toolCall},
        {kind: 'text', id: 'x', text: '答案'},
      ]),
    );

    expect(groupToolProcess(blocks)).toEqual([
      {
        kind: 'process',
        steps: [
          expect.objectContaining({kind: 'thinking'}),
          expect.objectContaining({kind: 'tool'}),
        ],
      },
      {kind: 'text', text: '答案', segmentIndex: 2},
    ]);
  });

  it('leaves thinking-only sections unwrapped', () => {
    const blocks = toBlocks(
      message([
        {kind: 'thinking', id: 't1', step: 0, text: '只想', startedAt: 1},
        {kind: 'text', id: 'x', text: '答案'},
      ]),
    );

    expect(groupToolProcess(blocks).map(block => block.kind)).toEqual([
      'thinking',
      'text',
    ]);
  });

  it('keeps text and client tool blocks outside the process group', () => {
    const blocks = toBlocks(
      message([
        {kind: 'text', id: 'x', text: '先说明'},
        {kind: 'tool', id: 'search_1', step: 0, call: toolCall},
        {kind: 'text', id: 'y', text: '后说明'},
      ]),
    );

    expect(groupToolProcess(blocks).map(block => block.kind)).toEqual([
      'text',
      'process',
      'text',
    ]);
  });
});
