import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../src/config/appConfig';
import type {ChunkDelta, ChatCompletionChunk} from '../src/adapters/api/types';
import {
  parseToolArguments,
  summarizeToolArguments,
} from '../src/domain/chat/toolCall';
import type {AssistantMessage} from '../src/domain/chat/types';
import {conversationRepository} from '../src/adapters/data/repositories/conversationRepository';
import {
  applyStreamChunk,
  createAssistantMessage,
} from '../src/features/chat/streamReducer';

const chunk = (delta: ChunkDelta, finish?: string): ChatCompletionChunk => ({
  id: 'cmpl',
  choices: [{index: 0, delta, finish_reason: finish ?? null}],
});

const stream = (
  message: AssistantMessage,
  ...deltas: Array<[ChunkDelta, string?]>
): AssistantMessage =>
  deltas.reduce(
    (current, [delta, finish]) =>
      applyStreamChunk(current, chunk(delta, finish)),
    message,
  );

const firstFragment = {
  index: 0,
  id: 'call_1',
  type: 'function' as const,
  function: {name: 'get_weather', arguments: ''},
};

describe('client tool calls', () => {
  it('assembles streamed tool_call fragments into one call', () => {
    const message = stream(
      createAssistantMessage('m1', 1),
      [{tool_calls: [firstFragment]}],
      [{tool_calls: [{index: 0, function: {arguments: '{"city":'}}]}],
      [{tool_calls: [{index: 0, function: {arguments: '"上海"}'}}]}],
    );

    expect(message.clientToolCalls).toHaveLength(1);
    expect(message.clientToolCalls[0]).toMatchObject({
      id: 'call_1',
      name: 'get_weather',
      argumentsText: '{"city":"上海"}',
      status: 'running',
    });
    // 时间线上同一个调用只出现一次，且随分片更新。
    expect(message.segments).toHaveLength(1);
    expect(message.segments[0]).toMatchObject({
      kind: 'client_tool',
      id: 'call_1',
    });
    expect(parseToolArguments(message.clientToolCalls[0])).toEqual({
      city: '上海',
    });
  });

  it('keeps parallel calls apart by index', () => {
    const message = stream(
      createAssistantMessage('m1', 1),
      [
        {
          tool_calls: [
            {
              index: 1,
              id: 'b',
              type: 'function',
              function: {name: 'two', arguments: ''},
            },
            {
              index: 0,
              id: 'a',
              type: 'function',
              function: {name: 'one', arguments: ''},
            },
          ],
        },
      ],
      [{tool_calls: [{index: 1, function: {arguments: '{"x":1}'}}]}],
      [{tool_calls: [{index: 0, function: {arguments: '{"y":2}'}}]}],
    );

    expect(message.clientToolCalls.map(call => call.id)).toEqual(['a', 'b']);
    expect(message.clientToolCalls[0].argumentsText).toBe('{"y":2}');
    expect(message.clientToolCalls[1].argumentsText).toBe('{"x":1}');
  });

  it('ignores fragments that cannot be attributed to a call', () => {
    const message = stream(createAssistantMessage('m1', 1), [
      {tool_calls: [{index: 0, function: {arguments: '{"x":1}'}}]},
    ]);

    expect(message.clientToolCalls).toEqual([]);
    expect(message.segments).toEqual([]);
  });

  it('parks the message in awaiting_tool when the model asks for a tool', () => {
    const message = stream(
      createAssistantMessage('m1', 1),
      [{tool_calls: [firstFragment]}],
      [{}, 'tool_calls'],
    );

    expect(message.status).toBe('awaiting_tool');
    expect(message.content).toBe('');
  });

  it('treats incomplete argument JSON as not-yet-parsable', () => {
    const message = stream(
      createAssistantMessage('m1', 1),
      [{tool_calls: [firstFragment]}],
      [{tool_calls: [{index: 0, function: {arguments: '{"city":'}}]}],
    );

    expect(parseToolArguments(message.clientToolCalls[0])).toBeNull();
    expect(summarizeToolArguments(message.clientToolCalls[0])).toBe('{"city":');
  });

  it('summarizes arguments for the tool card', () => {
    const call = {
      id: 'call_1',
      name: 'get_weather',
      argumentsText: '{"city":"上海","unit":"c"}',
      status: 'completed' as const,
      result: '晴',
    };

    expect(summarizeToolArguments(call)).toBe('city=上海 · unit=c');
    expect(summarizeToolArguments({...call, argumentsText: ''})).toBe('');
  });
});

describe('restoring client tool calls', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('restores calls, fails interrupted ones and aborts the turn', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.conversations,
      JSON.stringify([
        {
          id: 'c1',
          title: '工具',
          titleSource: 'auto',
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              id: 'a1',
              role: 'assistant',
              content: '',
              createdAt: 2,
              status: 'awaiting_tool',
              segments: [
                {
                  kind: 'client_tool',
                  id: 'call_1',
                  call: {
                    id: 'call_1',
                    name: 'get_weather',
                    argumentsText: '{"city":"上海"}',
                    status: 'running',
                  },
                },
              ],
              reasoning: '',
              annotations: [],
              serverToolCalls: [],
              clientToolCalls: [
                {
                  id: 'call_1',
                  name: 'get_weather',
                  argumentsText: '{"city":"上海"}',
                  status: 'running',
                },
              ],
              activeStep: 0,
            },
          ],
        },
      ]),
    );

    const [conversation] = await conversationRepository.load();
    const message = conversation.messages[0] as AssistantMessage;

    expect(message.clientToolCalls).toHaveLength(1);
    expect(message.clientToolCalls[0]).toMatchObject({
      id: 'call_1',
      name: 'get_weather',
      status: 'failed',
    });
    expect(message.segments[0]).toMatchObject({
      kind: 'client_tool',
      id: 'call_1',
    });
    // 冷启动后等待工具的一轮已经无法继续，收尾成 aborted。
    expect(message.status).toBe('aborted');
  });

  it('skips records outside the current conversation schema', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.conversations,
      JSON.stringify([
        {
          id: 'c1',
          title: '旧数据',
          titleSource: 'auto',
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              id: 'a1',
              role: 'assistant',
              content: '旧回答',
              createdAt: 2,
              status: 'complete',
              segments: [],
              reasoning: '',
              annotations: [],
              serverToolCalls: [],
              activeStep: 0,
            },
          ],
        },
      ]),
    );

    await expect(conversationRepository.load()).resolves.toEqual([]);
  });
});
