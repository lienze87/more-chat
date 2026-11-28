import type {StreamChatOptions} from '../src/adapters/api/chatClient';
import type {ChunkDelta, ChatCompletionChunk} from '../src/adapters/api/types';
import type {AssistantMessage, Conversation} from '../src/domain/chat/types';
import {DEFAULT_SETTINGS} from '../src/domain/settings/types';
import {createAssistantMessage} from '../src/features/chat/streamReducer';

jest.mock('../src/adapters/api/chatClient', () => ({
  streamChatCompletion: jest.fn(),
}));

type EngineModule = typeof import('../src/features/chat/chatEngine');
type StoreModule = typeof import('../src/features/chat/chatStore');
type SettingsModule = typeof import('../src/features/settings/settingsStore');
type ClientModule = {streamChatCompletion: jest.Mock};
type ErrorsModule = typeof import('../src/adapters/api/errors');

interface Modules {
  client: ClientModule;
  engine: EngineModule;
  chat: StoreModule;
  settings: SettingsModule;
  errors: ErrorsModule;
  skills: typeof import('../src/features/extensions/skillsStore');
}

/**
 * 每个用例拿一份全新的模块实例。
 *
 * chatEngine 的运行态（activeRun / pendingChunks / flushTimer）是模块级变量，
 * 不隔离就会串味；隔离同时也保证了这是“黑盒”特征测试：用例只通过
 * sendMessage / stopStreaming / regenerateFrom 三个公开入口驱动。
 */
function loadModules(): Modules {
  const modules = {} as Modules;
  jest.isolateModules(() => {
    modules.client = jest.requireMock<ClientModule>(
      '../src/adapters/api/chatClient',
    );
    modules.engine = jest.requireActual<EngineModule>(
      '../src/features/chat/chatEngine',
    );
    modules.chat = jest.requireActual<StoreModule>(
      '../src/features/chat/chatStore',
    );
    modules.settings = jest.requireActual<SettingsModule>(
      '../src/features/settings/settingsStore',
    );
    modules.errors = jest.requireActual<ErrorsModule>(
      '../src/adapters/api/errors',
    );
    modules.skills = jest.requireActual(
      '../src/features/extensions/skillsStore',
    );
  });
  return modules;
}

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  title: '新对话',
  titleSource: 'fallback',
  createdAt: 1,
  updatedAt: 1,
  messages: [],
  ...overrides,
});

const chunk = (delta: ChunkDelta, finish?: string): ChatCompletionChunk => ({
  id: 'cmpl',
  choices: [{index: 0, delta, finish_reason: finish ?? null}],
});

function setup(options: {apiKey?: string; conversation?: Conversation} = {}) {
  const modules = loadModules();
  modules.chat.useChatStore.setState({
    conversations: [options.conversation ?? conversation()],
    streaming: null,
    hydrated: true,
  });
  modules.settings.useSettingsStore.setState({
    settings: {...DEFAULT_SETTINGS},
    apiKey: options.apiKey ?? 'sk-test',
    hydrated: true,
  });

  const abort = jest.fn();
  modules.client.streamChatCompletion.mockImplementation(() => ({abort}));
  return {...modules, abort};
}

const lastStreamOptions = (client: ClientModule): StreamChatOptions => {
  const {calls} = client.streamChatCompletion.mock;
  return calls[calls.length - 1][0] as StreamChatOptions;
};

/** 系统提示词固定在最前，比较对话轮次时把它排除掉。 */
const turnsOf = (options: StreamChatOptions) =>
  options.request.messages.filter(message => message.role !== 'system');

const assistantOf = (
  chat: StoreModule,
  conversationId = 'c1',
): AssistantMessage => {
  const target = chat.useChatStore
    .getState()
    .conversations.find(item => item.id === conversationId);
  const message = target?.messages.find(item => item.role === 'assistant');
  if (!message || message.role !== 'assistant') {
    throw new Error('assistant message not found');
  }
  return message;
};

describe('chatEngine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('refuses to send without an API key', async () => {
    const {client, engine} = setup({apiKey: '   '});

    // 错误类来自隔离后的模块实例，用 name 判断而不是 instanceof。
    await expect(engine.sendMessage('c1', '你好')).rejects.toMatchObject({
      name: 'MissingApiKeyError',
    });
    expect(client.streamChatCompletion).not.toHaveBeenCalled();
  });

  it('ignores empty input', async () => {
    const {client, engine} = setup();

    await engine.sendMessage('c1', '   ');

    expect(client.streamChatCompletion).not.toHaveBeenCalled();
  });

  it('appends the user turn and a streaming placeholder before requesting', async () => {
    const {client, chat, engine} = setup();

    const pending = engine.sendMessage('c1', ' 你好 ');

    const messages = chat.useChatStore.getState().conversations[0].messages;
    expect(messages.map(message => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(messages[0].content).toBe('你好');
    expect((messages[1] as AssistantMessage).status).toBe('streaming');
    expect(chat.useChatStore.getState().streaming).toEqual({
      conversationId: 'c1',
      messageId: messages[1].id,
    });

    // 发送时固化环境快照，请求里同时带上 reminder 与包好的 user_query。
    const userMessage = messages[0];
    const envInfo =
      userMessage.role === 'user' ? userMessage.envInfo : undefined;
    expect(envInfo).toContain('<env_info>');
    expect(envInfo).toContain('可用工具: 联网搜索、阅读链接');

    const options = lastStreamOptions(client);
    expect(options.request.stream).toBe(true);
    expect(options.request.messages[0].role).toBe('system');
    expect(options.request.messages[1]).toEqual({
      role: 'latest_reminder',
      content: expect.stringContaining(',App,中文'),
    });
    expect(options.request.messages[2]).toEqual({
      role: 'user',
      content: expect.stringContaining('<user_query>\n你好\n</user_query>'),
    });
    expect(options.request.title).toEqual({enabled: true});

    options.onDone();
    await pending;
  });

  it('describes only the enabled server tools in the env snapshot', async () => {
    const {client, chat, engine, settings} = setup();
    settings.useSettingsStore.setState({
      settings: {...DEFAULT_SETTINGS, webSearch: false, readUrl: false},
    });

    const pending = engine.sendMessage('c1', '你好');
    const userMessage =
      chat.useChatStore.getState().conversations[0].messages[0];
    expect(userMessage.role).toBe('user');
    const envInfo = userMessage.role === 'user' ? userMessage.envInfo : '';
    expect(envInfo).toContain('可用工具: 本地文件、JavaScript 执行');

    lastStreamOptions(client).onDone();
    await pending;
  });

  it('flushes chunks on a 40ms cadence instead of once per token', async () => {
    const {client, chat, engine} = setup();

    const pending = engine.sendMessage('c1', '你好');
    const options = lastStreamOptions(client);

    options.onChunk(chunk({content: '答'}));
    options.onChunk(chunk({content: '案'}));
    expect(assistantOf(chat).content).toBe('');

    jest.advanceTimersByTime(50);
    expect(assistantOf(chat).content).toBe('答案');

    options.onDone();
    await pending;
  });

  it('marks the answer complete and adopts the model title', async () => {
    const {client, chat, engine} = setup();

    const pending = engine.sendMessage('c1', '你好');
    const options = lastStreamOptions(client);

    options.onChunk(chunk({content: '答案'}));
    options.onChunk(chunk({title: '模型标题'}));
    options.onDone();
    await pending;

    expect(assistantOf(chat).status).toBe('complete');
    expect(chat.useChatStore.getState().streaming).toBeNull();
    expect(chat.useChatStore.getState().conversations[0].title).toBe(
      '模型标题',
    );
    expect(chat.useChatStore.getState().conversations[0].titleSource).toBe(
      'auto',
    );
  });

  it('marks the answer aborted when the user stops the stream', async () => {
    const {client, chat, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    const options = lastStreamOptions(client);

    options.onChunk(chunk({content: '半'}));
    engine.stopStreaming();
    expect(abort).toHaveBeenCalledTimes(1);

    options.onDone();
    await pending;

    expect(assistantOf(chat).status).toBe('aborted');
    // 已经流出的内容保留，只是把状态收尾成 aborted。
    expect(assistantOf(chat).content).toBe('半');
    expect(chat.useChatStore.getState().streaming).toBeNull();
  });

  it('surfaces transport failures as a localized error state', async () => {
    const {client, chat, engine, errors} = setup();

    const pending = engine.sendMessage('c1', '你好');
    const options = lastStreamOptions(client);

    options.onError(new errors.ApiError('Invalid API key', {status: 401}));
    await pending;

    expect(assistantOf(chat).status).toBe('error');
    expect(assistantOf(chat).error).toBe(
      'API Key 无效或已过期，请在设置中检查。',
    );
    expect(chat.useChatStore.getState().streaming).toBeNull();
  });

  it('releases the run when the transport throws before returning a handle', async () => {
    const {client, chat, engine} = setup();
    client.streamChatCompletion.mockImplementationOnce(() => {
      throw new Error('请求无法初始化');
    });

    await engine.sendMessage('c1', '第一条');

    expect(assistantOf(chat)).toMatchObject({
      status: 'error',
      error: '请求无法初始化',
    });
    expect(chat.useChatStore.getState().streaming).toBeNull();

    const pending = engine.sendMessage('c1', '第二条');
    expect(client.streamChatCompletion).toHaveBeenCalledTimes(2);
    lastStreamOptions(client).onDone();
    await pending;
  });

  it('ignores late callbacks from an aborted run during the next run', async () => {
    const {client, chat, engine} = setup();
    const first = engine.sendMessage('c1', '第一条');
    const oldStream = lastStreamOptions(client);
    engine.stopStreaming();
    await first;

    const second = engine.sendMessage('c1', '第二条');
    const newStream = lastStreamOptions(client);
    const active = chat.useChatStore.getState().streaming;
    oldStream.onChunk(chunk({content: '过期内容'}));
    oldStream.onDone();
    newStream.onChunk(chunk({content: '当前回复'}));
    expect(chat.useChatStore.getState().streaming).toEqual(active);

    newStream.onDone();
    await second;
    expect(
      chat.useChatStore.getState().conversations[0].messages.at(-1),
    ).toMatchObject({status: 'complete', content: '当前回复'});
  });

  it('ends an unsupported client tool call as a retryable failure', async () => {
    const {client, chat, engine} = setup();
    const pending = engine.sendMessage('c1', '你好');
    const stream = lastStreamOptions(client);
    stream.onChunk(
      chunk(
        {
          tool_calls: [{index: 0, id: 'call_1', function: {name: 'example'}}],
        },
        'tool_calls',
      ),
    );
    stream.onDone();
    await pending;

    expect(assistantOf(chat)).toMatchObject({
      status: 'error',
      clientToolCalls: [{id: 'call_1', status: 'failed'}],
      segments: [{kind: 'client_tool', call: {status: 'failed'}}],
    });
    expect(chat.useChatStore.getState().streaming).toBeNull();
  });

  it('returns operation errors and validation failures and replays them after restore', async () => {
    const {client, chat, engine, abort} = setup();
    const pending = engine.sendMessage('c1', '读文件');
    const first = lastStreamOptions(client);
    const followupRequest = new Promise<StreamChatOptions>(resolve => {
      client.streamChatCompletion.mockImplementationOnce(
        (opts: StreamChatOptions) => {
          resolve(opts);
          return {abort};
        },
      );
    });
    first.onChunk(
      chunk(
        {
          tool_calls: [
            {
              index: 0,
              id: 'missing',
              function: {
                name: 'read_file',
                arguments: '{"path":"skills/notes/missing.md"}',
              },
            },
            {
              index: 1,
              id: 'invalid',
              function: {
                name: 'write_file',
                arguments: '{"path":"workspace/out.md","content":42}',
              },
            },
          ],
        },
        'tool_calls',
      ),
    );
    first.onDone();

    const second = await followupRequest;
    const operationError = {
      role: 'tool',
      tool_call_id: 'missing',
      content: JSON.stringify({
        type: 'error',
        message: '文件不存在：skills/notes/missing.md',
      }),
    };
    const validationError = {
      role: 'tool',
      tool_call_id: 'invalid',
      content: expect.stringContaining(
        '错误：工具参数无效：content 必须是字符串',
      ),
    };
    expect(turnsOf(second).slice(-2)).toEqual([
      operationError,
      validationError,
    ]);
    second.onChunk(chunk({content: '文件没有找到。'}, 'stop'));
    second.onDone();
    await pending;
    expect(assistantOf(chat).segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'client_tool',
          call: expect.objectContaining({id: 'missing', status: 'failed'}),
        }),
      ]),
    );

    await chat.flushConversations();
    await chat.useChatStore.getState().hydrate();
    const nextTurn = engine.sendMessage('c1', '继续');
    const third = lastStreamOptions(client);
    expect(turnsOf(third)).toEqual(
      expect.arrayContaining([operationError, validationError]),
    );
    third.onDone();
    await nextTurn;
  });

  it('loads skill instructions and continues through text and image tool rounds', async () => {
    const samplePng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGhsAAAAASUVORK5CYII=';
    const {client, chat, engine, skills, abort} = setup();
    skills.useSkillsStore.setState({
      skills: [
        {
          name: 'notes',
          description: '整理笔记',
          enabled: true,
          files: {'SKILL.md': '# 整理笔记', 'example.png': samplePng},
        },
      ],
    });

    const pending = engine.sendMessage('c1', '请整理笔记');
    const first = lastStreamOptions(client);
    expect(first.request.messages[0].content).toContain(
      'skills/notes/SKILL.md',
    );
    expect(first.request.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({name: 'read_file'}),
        }),
        {type: 'deepseek_web_search'},
      ]),
    );

    const finishWithCall = (
      stream: StreamChatOptions,
      name: string,
      path: string,
      reasoning: string,
    ) => {
      const next = new Promise<StreamChatOptions>(resolve => {
        client.streamChatCompletion.mockImplementationOnce(
          (opts: StreamChatOptions) => {
            resolve(opts);
            return {abort};
          },
        );
      });
      stream.onChunk(
        chunk(
          {
            reasoning_content: reasoning,
            tool_calls: [
              {
                index: 0,
                id: name,
                function: {name, arguments: JSON.stringify({path})},
              },
            ],
          },
          'tool_calls',
        ),
      );
      stream.onDone();
      return next;
    };

    const second = await finishWithCall(
      first,
      'read_file',
      'skills/notes/SKILL.md',
      '读取说明',
    );
    expect(second.request.title).toBeUndefined();
    expect(turnsOf(second).slice(-2)).toMatchObject([
      {
        role: 'assistant',
        reasoning_content: '读取说明',
        tool_calls: [{id: 'read_file'}],
      },
      {
        role: 'tool',
        tool_call_id: 'read_file',
        content: expect.stringContaining('# 整理笔记'),
      },
    ]);

    const third = await finishWithCall(
      second,
      'read_image',
      'skills/notes/example.png',
      '查看图片',
    );
    expect(turnsOf(third).slice(-4)).toMatchObject([
      {role: 'assistant', reasoning_content: '读取说明'},
      {role: 'tool', tool_call_id: 'read_file'},
      {
        role: 'assistant',
        reasoning_content: '查看图片',
        tool_calls: [{id: 'read_image'}],
      },
      {
        role: 'tool',
        tool_call_id: 'read_image',
        content: [
          {type: 'text'},
          {
            type: 'image_url',
            image_url: {url: `data:image/png;base64,${samplePng}`},
          },
        ],
      },
    ]);
    expect(chat.useChatStore.getState().streaming?.messageId).toBe(
      assistantOf(chat).id,
    );
    third.onChunk(
      chunk({reasoning_content: '总结', content: '笔记已整理'}, 'stop'),
    );
    third.onDone();
    await pending;

    const answer = assistantOf(chat);
    expect(answer).toMatchObject({
      status: 'complete',
      content: '笔记已整理',
      reasoning: '总结',
    });
    expect(answer.toolRounds).toHaveLength(2);
    expect(
      answer.segments.filter(segment => segment.kind === 'client_tool'),
    ).toHaveLength(2);
    expect(chat.useChatStore.getState().conversations[0].messages).toHaveLength(
      2,
    );

    await chat.flushConversations();
    await chat.useChatStore.getState().hydrate();
    expect(assistantOf(chat).toolRounds).toHaveLength(2);
    const followup = engine.sendMessage('c1', '继续');
    const fourth = lastStreamOptions(client);
    expect(
      fourth.request.messages.find(
        message =>
          message.role === 'tool' && message.tool_call_id === 'read_image',
      ),
    ).toMatchObject({content: '已读取图片 skills/notes/example.png'});
    fourth.onDone();
    await followup;
  });

  it('keeps truncation and refusal apart from normal completion', async () => {
    const truncated = setup();
    const first = truncated.engine.sendMessage('c1', '你好');
    const firstOptions = lastStreamOptions(truncated.client);
    firstOptions.onChunk(chunk({content: '半个'}, 'length'));
    firstOptions.onDone();
    await first;
    expect(assistantOf(truncated.chat).truncated).toBe(true);
    expect(assistantOf(truncated.chat).status).toBe('complete');

    const refused = setup();
    const second = refused.engine.sendMessage('c1', '你好');
    const secondOptions = lastStreamOptions(refused.client);
    secondOptions.onChunk(chunk({content: '不该出现'}));
    secondOptions.onChunk(chunk({}, 'content_filter'));
    secondOptions.onDone();
    await second;
    expect(assistantOf(refused.chat).status).toBe('refused');
    expect(assistantOf(refused.chat).content).toBe('');
  });

  it('ignores a second send while a run is in flight', async () => {
    const {client, engine, chat} = setup();

    const pending = engine.sendMessage('c1', '第一条');
    await engine.sendMessage('c1', '第二条');

    expect(client.streamChatCompletion).toHaveBeenCalledTimes(1);
    expect(
      chat.useChatStore
        .getState()
        .conversations[0].messages.filter(message => message.role === 'user'),
    ).toHaveLength(1);

    lastStreamOptions(client).onDone();
    await pending;
  });

  it('regenerates the last answer by replaying the user turn', async () => {
    const {client, chat, engine} = setup({
      conversation: conversation({
        messages: [
          {
            id: 'u1',
            role: 'user',
            envInfo: '<env_info>测试</env_info>',
            reminder: '2026-11-22,星期日,上海,App,中文',
            content: '问题',
            createdAt: 1,
            status: 'complete',
          },
          {
            ...createAssistantMessage('a1', 1),
            content: '旧答案',
            status: 'complete',
            segments: [{kind: 'text', id: 'a1-seg0', text: '旧答案'}],
          },
        ],
      }),
    });

    const pending = engine.regenerateFrom('c1', 'a1');
    const options = lastStreamOptions(client);

    const messages = chat.useChatStore.getState().conversations[0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('u1');
    expect((messages[1] as AssistantMessage).status).toBe('streaming');
    expect(turnsOf(options)).toEqual([
      {role: 'latest_reminder', content: '2026-11-22,星期日,上海,App,中文'},
      {
        role: 'user',
        content:
          '<env_info>测试</env_info>\n\n<user_query>\n问题\n</user_query>',
      },
    ]);

    options.onDone();
    await pending;
  });

  it('regenerating a middle answer drops the turns after it', async () => {
    const {client, chat, engine} = setup({
      conversation: conversation({
        messages: [
          {
            id: 'u1',
            role: 'user',
            envInfo: '<env_info>测试</env_info>',
            reminder: '2026-11-22,星期日,上海,App,中文',
            content: '第一问',
            createdAt: 1,
            status: 'complete',
          },
          {
            ...createAssistantMessage('a1', 1),
            content: '第一答',
            status: 'complete',
            segments: [{kind: 'text', id: 'a1-seg0', text: '第一答'}],
          },
          {
            id: 'u2',
            role: 'user',
            envInfo: '<env_info>测试</env_info>',
            reminder: '2026-11-22,星期日,上海,App,中文',
            content: '第二问',
            createdAt: 1,
            status: 'complete',
          },
          {
            ...createAssistantMessage('a2', 1),
            content: '第二答',
            status: 'complete',
            segments: [{kind: 'text', id: 'a2-seg0', text: '第二答'}],
          },
        ],
      }),
    });

    const pending = engine.regenerateFrom('c1', 'a1');
    const options = lastStreamOptions(client);

    // a1 及其之后的 u2 / a2 都被丢弃，只留第一条用户消息 + 新的占位。
    const messages = chat.useChatStore.getState().conversations[0].messages;
    expect(messages.map(message => message.id)).toEqual([
      'u1',
      expect.any(String),
    ]);
    expect(turnsOf(options)).toEqual([
      {role: 'latest_reminder', content: '2026-11-22,星期日,上海,App,中文'},
      {
        role: 'user',
        content:
          '<env_info>测试</env_info>\n\n<user_query>\n第一问\n</user_query>',
      },
    ]);

    options.onDone();
    await pending;
  });

  it('does not regenerate when there is no user turn before the answer', async () => {
    const {client, engine} = setup({
      conversation: conversation({
        messages: [{...createAssistantMessage('a1', 1), content: '孤儿回答'}],
      }),
    });

    await engine.regenerateFrom('c1', 'a1');

    expect(client.streamChatCompletion).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'retains later turns when retrying a historical failure (success: %s)',
    async succeeds => {
      const {client, chat, engine} = setup();
      const failed = engine.sendMessage('c1', '第一问');
      const first = lastStreamOptions(client);
      first.onChunk(chunk({content: '保留这段回复'}));
      first.onError(new Error('网络断开'));
      await failed;

      const later = engine.sendMessage('c1', '第二问');
      const second = lastStreamOptions(client);
      second.onChunk(chunk({content: '第二答'}, 'stop'));
      second.onDone();
      await later;

      const messages = () =>
        chat.useChatStore.getState().conversations[0].messages;
      const target = messages()[1];
      const laterTurns = messages().slice(2);
      const retry = engine.retryFailedReply('c1', target.id);
      const retryStream = lastStreamOptions(client);
      expect(
        turnsOf(retryStream)
          .map(turn => turn.content)
          .join(),
      ).not.toContain('第二问');
      if (succeeds) {
        retryStream.onChunk(chunk({content: '新回答'}, 'stop'));
        retryStream.onDone();
      } else {
        retryStream.onError(new Error('再次失败'));
      }
      await retry;

      expect(messages()[1]).toMatchObject({
        id: target.id,
        content: succeeds ? '新回答' : '保留这段回复',
        status: succeeds ? 'complete' : 'error',
      });
      expect(messages().slice(2)).toEqual(laterTurns);
    },
  );

  it('aborts the run when its conversation is deleted, without UI help', async () => {
    const {client, chat, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    engine.deleteConversation('c1');

    expect(abort).toHaveBeenCalledTimes(1);

    lastStreamOptions(client).onDone();
    await pending;
    expect(chat.useChatStore.getState().streaming).toBeNull();
  });

  it('aborts the run when every conversation is cleared', async () => {
    const {client, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    engine.deleteAllConversations();
    expect(abort).toHaveBeenCalledTimes(1);

    lastStreamOptions(client).onDone();
    await pending;
  });

  it('keeps running when an unrelated conversation is deleted', async () => {
    const {client, chat, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    engine.deleteConversation('other');

    expect(abort).not.toHaveBeenCalled();
    expect(chat.useChatStore.getState().streaming).not.toBeNull();

    lastStreamOptions(client).onDone();
    await pending;
  });

  it('does nothing when the conversation is gone', async () => {
    const {client, engine} = setup();

    await engine.sendMessage('missing', '你好');

    expect(client.streamChatCompletion).not.toHaveBeenCalled();
  });
});
