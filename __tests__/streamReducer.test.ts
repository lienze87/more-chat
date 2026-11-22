import {
  applyStreamChunk,
  createAssistantMessage,
  markAborted,
  markFailed,
} from '../src/features/chat/streamReducer';
import type {
  ChatCompletionChunk,
  ChunkChoice,
  ChunkDelta,
} from '../src/adapters/api/types';
import type {ServerToolCall} from '../src/domain/chat/types';

const chunk = (
  delta: ChunkDelta,
  extra: Partial<ChunkChoice> = {},
): ChatCompletionChunk => ({
  id: 'chunk',
  choices: [{index: 0, delta, ...extra}],
});

const searchCall: ServerToolCall = {
  index: 0,
  id: 'srvtoolu_1',
  type: 'deepseek_web_search',
  kind: 'search',
  action: {type: 'search', queries: ['DeepSeek']},
  status: 'completed',
};

describe('streamReducer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds thinking, tool and text segments in order', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({reasoning_content: '先分析'}));

    expect(message.segments).toHaveLength(1);
    expect(message.segments[0]).toMatchObject({
      kind: 'thinking',
      text: '先分析',
      step: 0,
    });

    message = applyStreamChunk(
      message,
      chunk({}, {server_tool_event: {type: 'step_reasoning_done', step: 0}}),
    );
    expect(message.activeStep).toBe(1);
    expect(message.segments[0]).toMatchObject({kind: 'thinking', done: true});

    message = applyStreamChunk(
      message,
      chunk(
        {},
        {
          server_tool_event: {
            type: 'call_started',
            step: 0,
            call: searchCall,
          },
        },
      ),
    );
    expect(message.segments.some(segment => segment.kind === 'tool')).toBe(
      true,
    );

    message = applyStreamChunk(message, chunk({content: '答案'}));
    expect(message.content).toBe('答案');
    expect(message.segments.map(segment => segment.kind)).toEqual([
      'thinking',
      'tool',
      'text',
    ]);

    message = applyStreamChunk(
      message,
      chunk(
        {
          server_tool_calls: [
            {
              index: 0,
              reasoning_content: '先分析',
              calls: [searchCall],
            },
          ],
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://example.com',
                title: 'Example',
                start_index: 0,
                end_index: 2,
              },
            },
          ],
          title: '测试标题',
        },
        {finish_reason: 'stop'},
      ),
    );

    expect(message.status).toBe('complete');
    expect(message.reasoning).toBe('先分析');
    expect(message.title).toBe('测试标题');
    expect(message.annotations).toHaveLength(1);
    expect(message.serverToolCalls).toHaveLength(1);
  });

  it('records thinking duration until the answer starts', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({reasoning_content: '先分析'}));
    clock.mockReturnValue(4_000);
    message = applyStreamChunk(message, chunk({content: '答案'}));

    expect(message.segments[0]).toMatchObject({
      kind: 'thinking',
      done: true,
      startedAt: 1_000,
      endedAt: 4_000,
    });
    clock.mockRestore();
  });

  it('closes thinking when the stream finishes without answer content', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(2_000);
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({reasoning_content: '先分析'}));
    clock.mockReturnValue(5_000);
    message = applyStreamChunk(message, chunk({}, {finish_reason: 'stop'}));

    expect(message.segments[0]).toMatchObject({
      kind: 'thinking',
      done: true,
      startedAt: 2_000,
      endedAt: 5_000,
    });
    clock.mockRestore();
  });

  it('merges call_started and call_completed into one card', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(
      message,
      chunk(
        {},
        {
          server_tool_event: {
            type: 'call_started',
            step: 0,
            call: {...searchCall, status: 'running'},
          },
        },
      ),
    );
    message = applyStreamChunk(
      message,
      chunk(
        {},
        {
          server_tool_event: {
            type: 'call_completed',
            step: 0,
            call: {
              ...searchCall,
              sources: [{url: 'https://example.com', title: 'Example'}],
            },
          },
        },
      ),
    );

    const toolSegments = message.segments.filter(
      segment => segment.kind === 'tool',
    );
    expect(toolSegments).toHaveLength(1);
    expect(
      toolSegments[0].kind === 'tool' ? toolSegments[0].call.sources : [],
    ).toHaveLength(1);
    expect(
      toolSegments[0].kind === 'tool' ? toolSegments[0].call.action : null,
    ).toEqual({type: 'search', queries: ['DeepSeek']});
  });

  it('clears answer and thinking on a safety refusal but keeps tools', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({reasoning_content: '思考'}));
    message = applyStreamChunk(
      message,
      chunk(
        {},
        {
          server_tool_event: {
            type: 'call_started',
            step: 0,
            call: searchCall,
          },
        },
      ),
    );
    message = applyStreamChunk(message, chunk({content: '敏感内容'}));
    message = applyStreamChunk(
      message,
      chunk({}, {finish_reason: 'content_filter'}),
    );

    expect(message.status).toBe('refused');
    expect(message.content).toBe('');
    expect(message.reasoning).toBe('');
    expect(message.segments.map(segment => segment.kind)).toEqual(['tool']);
    expect(message.refusal).toBeTruthy();
  });

  it('marks truncated answers', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({content: '长回答'}));
    message = applyStreamChunk(message, chunk({}, {finish_reason: 'length'}));
    expect(message.status).toBe('complete');
    expect(message.truncated).toBe(true);
  });

  it('derives reasoning from thinking segments when no tools are used', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({reasoning_content: '第一段'}));
    message = applyStreamChunk(message, chunk({reasoning_content: '第二段'}));
    message = applyStreamChunk(message, chunk({}, {finish_reason: 'stop'}));
    expect(message.reasoning).toBe('第一段第二段');
  });

  it('keeps content and status on stop and exposes terminal helpers', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({content: '部分回答'}));
    const aborted = markAborted(message);
    expect(aborted.status).toBe('aborted');
    expect(aborted.content).toBe('部分回答');

    const failed = markFailed(message, '网络错误');
    expect(failed.status).toBe('error');
    expect(failed.error).toBe('网络错误');
  });

  it('ignores empty content deltas', () => {
    let message = createAssistantMessage('m', 0);
    message = applyStreamChunk(message, chunk({content: ''}));
    expect(message.segments).toHaveLength(0);
    expect(message.content).toBe('');
  });
});
