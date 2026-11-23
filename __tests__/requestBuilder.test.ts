import {
  buildApiMessages,
  buildChatRequest,
  isFirstTurnOf,
} from '../src/adapters/api/requestBuilder';
import {
  buildSystemPrompt,
  getDefaultSystemPrompt,
} from '../src/config/defaultSystemPrompt';
import {DEFAULT_SETTINGS} from '../src/domain/settings/types';
import type {Conversation} from '../src/domain/chat/types';

const conversation: Conversation = {
  id: 'conv',
  title: '测试',
  titleSource: 'fallback',
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: 'u1',
      role: 'user',
      content: '你好',
      createdAt: 1,
      status: 'complete',
      reminder: '2026-11-22,星期日,上海,App,中文',
    },
    {
      id: 'a1',
      role: 'assistant',
      content: '你好！',
      createdAt: 2,
      status: 'complete',
      segments: [],
      reasoning: '思考一下',
      annotations: [],
      serverToolCalls: [],
      clientToolCalls: [],
      activeStep: 1,
    },
  ],
};

describe('buildChatRequest', () => {
  it('sends reminder, user and assistant turns in order', () => {
    const request = buildChatRequest({
      conversation,
      settings: DEFAULT_SETTINGS,
      isFirstTurn: false,
    });
    // 系统提示词固定在最前，其后才是对话轮次。
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: buildSystemPrompt(),
    });
    expect(request.messages.slice(1)).toEqual([
      {
        role: 'latest_reminder',
        content: '2026-11-22,星期日,上海,App,中文',
      },
      {role: 'user', content: '<user_query>\n你好\n</user_query>'},
      {
        role: 'assistant',
        content: '你好！',
        reasoning_content: '思考一下',
      },
    ]);
  });

  it('attaches the env snapshot and wraps the user query', () => {
    const envInfo = [
      '<env_info>',
      '客户端: MoreChat 0.1.0',
      '平台: App（Android）',
      '可用工具: 联网搜索',
      '</env_info>',
    ].join('\n');
    const withEnv: Conversation = {
      ...conversation,
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: '你好',
          createdAt: 1,
          status: 'complete',
          reminder: '2026-11-22,星期日,上海,App,中文',
          envInfo,
        },
      ],
    };

    const messages = buildApiMessages(withEnv);

    expect(messages).toEqual([
      {
        role: 'latest_reminder',
        content: '2026-11-22,星期日,上海,App,中文',
      },
      {
        role: 'user',
        content: `${envInfo}\n\n<user_query>\n你好\n</user_query>`,
      },
    ]);
  });

  it('enables title only on the first turn', () => {
    const first = buildChatRequest({
      conversation: {...conversation, messages: [conversation.messages[0]]},
      settings: DEFAULT_SETTINGS,
      isFirstTurn: true,
    });
    expect(first.title).toEqual({enabled: true});
    expect(isFirstTurnOf(conversation)).toBe(false);

    const later = buildChatRequest({
      conversation,
      settings: DEFAULT_SETTINGS,
      isFirstTurn: false,
    });
    expect(later.title).toBeUndefined();
  });

  it('declares server tools and safety check', () => {
    const request = buildChatRequest({
      conversation,
      settings: DEFAULT_SETTINGS,
      isFirstTurn: false,
    });
    expect(request.tools).toEqual([
      {type: 'deepseek_web_search'},
      {type: 'deepseek_read_url'},
    ]);
    expect(request.safety_check).toEqual({level: 'high'});
    expect(request.thinking).toEqual({type: 'enabled'});
    expect(request.reasoning_effort).toBe('high');
  });

  it('omits tools and reasoning effort when disabled', () => {
    const request = buildChatRequest({
      conversation,
      settings: {
        ...DEFAULT_SETTINGS,
        webSearch: false,
        readUrl: false,
        thinking: false,
      },
      isFirstTurn: false,
    });
    expect(request.tools).toBeUndefined();
    expect(request.reasoning_effort).toBeUndefined();
    expect(request.thinking).toEqual({type: 'disabled'});
  });

  it('prepends a system prompt and skips failed turns', () => {
    const messages = buildApiMessages(
      {
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: 'a2',
            role: 'assistant',
            content: '',
            createdAt: 3,
            status: 'error',
            segments: [],
            reasoning: '',
            annotations: [],
            serverToolCalls: [],
            clientToolCalls: [],
            activeStep: 0,
          },
        ],
      },
      '你是助手',
    );
    expect(messages[0]).toEqual({role: 'system', content: '你是助手'});
    expect(messages).toHaveLength(4);
  });

  it('replays client tool calls and their results', () => {
    const withTool: Conversation = {
      ...conversation,
      messages: [
        conversation.messages[0],
        {
          id: 'a1',
          role: 'assistant',
          content: '',
          createdAt: 2,
          status: 'complete',
          segments: [],
          reasoning: '',
          annotations: [],
          serverToolCalls: [],
          clientToolCalls: [
            {
              id: 'call_1',
              name: 'get_weather',
              argumentsText: '{"city":"上海"}',
              status: 'completed',
              result: '晴，24℃',
            },
            {
              id: 'call_2',
              name: 'get_time',
              argumentsText: '{}',
              status: 'running',
            },
          ],
          activeStep: 0,
        },
      ],
    };

    const messages = buildApiMessages(withTool);

    // [0] latest_reminder, [1] user, [2] assistant, [3] tool
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {name: 'get_weather', arguments: '{"city":"上海"}'},
        },
      ],
    });
    // 回放时只发送能够配对工具结果的调用。
    expect(messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '晴，24℃',
    });
    expect(messages).toHaveLength(4);
  });

  it('keeps a tool-only answer in the first turn check', () => {
    const toolOnly: Conversation = {
      ...conversation,
      messages: [
        conversation.messages[0],
        {
          id: 'a1',
          role: 'assistant',
          content: '',
          createdAt: 2,
          status: 'complete',
          segments: [],
          reasoning: '',
          annotations: [],
          serverToolCalls: [],
          clientToolCalls: [
            {
              id: 'call_1',
              name: 'get_weather',
              argumentsText: '{}',
              status: 'completed',
              result: 'ok',
            },
          ],
          activeStep: 0,
        },
      ],
    };

    expect(isFirstTurnOf(toolOnly)).toBe(false);
  });

  it('falls back to the default model when the setting is blank', () => {
    const request = buildChatRequest({
      conversation,
      settings: {...DEFAULT_SETTINGS, model: '   '},
      isFirstTurn: false,
    });
    expect(request.model).toBe('deepseek-flash');
  });
});

describe('system prompt', () => {
  it('always sends the built-in default prompt', () => {
    expect(buildSystemPrompt()).toBe(getDefaultSystemPrompt().trimEnd());
    expect(buildSystemPrompt('   ')).toBe(getDefaultSystemPrompt().trimEnd());
  });

  it('appends the configured prompt after the default one', () => {
    const prompt = buildSystemPrompt('  用英文回答。  ');

    expect(prompt.startsWith(getDefaultSystemPrompt().trimEnd())).toBe(true);
    expect(prompt).toContain(
      '<configured_prompt>\n用英文回答。\n</configured_prompt>',
    );
    expect(prompt.indexOf('## 用户附加提示词')).toBeGreaterThan(
      prompt.indexOf('## 个性'),
    );
  });

  it('sends the composed prompt in the request', () => {
    const request = buildChatRequest({
      conversation,
      settings: {...DEFAULT_SETTINGS, systemPrompt: '回答尽量简短。'},
      isFirstTurn: false,
    });

    const system = request.messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toContain('回答尽量简短。');
    expect(system.content).toContain('你是 More');
  });
});
