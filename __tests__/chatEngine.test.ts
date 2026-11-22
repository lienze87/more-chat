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
      {role: 'user', content: '<user_query>\n问题\n</user_query>'},
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
      {role: 'user', content: '<user_query>\n第一问\n</user_query>'},
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

  it('aborts the run when its conversation is deleted, without UI help', async () => {
    const {client, chat, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    chat.useChatStore.getState().deleteConversation('c1');

    expect(abort).toHaveBeenCalledTimes(1);

    lastStreamOptions(client).onDone();
    await pending;
    expect(chat.useChatStore.getState().streaming).toBeNull();
  });

  it('aborts the run when every conversation is cleared', async () => {
    const {client, chat, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    chat.useChatStore.getState().deleteAllConversations();
    expect(abort).toHaveBeenCalledTimes(1);

    lastStreamOptions(client).onDone();
    await pending;
  });

  it('keeps running when an unrelated conversation is deleted', async () => {
    const {client, chat, engine, abort} = setup();

    const pending = engine.sendMessage('c1', '你好');
    chat.useChatStore.getState().deleteConversation('other');

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
