import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../src/config/appConfig';
import type {
  AssistantMessage,
  ChatMessage,
  Conversation,
} from '../src/domain/chat/types';
import {
  ensureLaunchConversation,
  flushConversations,
  sortConversationsByRecency,
  useChatStore,
} from '../src/features/chat/chatStore';
import {createAssistantMessage} from '../src/features/chat/streamReducer';

const conversation = (
  id: string,
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id,
  title: '新对话',
  titleSource: 'fallback',
  createdAt: 1,
  updatedAt: 1,
  messages: [],
  ...overrides,
});

const userMessage = (id: string, content: string): ChatMessage => ({
  id,
  role: 'user',
  envInfo: '<env_info>测试</env_info>',
  reminder: '2026-11-22,星期日,上海,App,中文',
  content,
  createdAt: 1,
  status: 'complete',
});

const assistantMessage = (
  id: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage => ({...createAssistantMessage(id, 1), ...overrides});

const readPersisted = async (): Promise<Conversation[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.conversations);
  return raw ? (JSON.parse(raw) as Conversation[]) : [];
};

describe('chatStore', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    useChatStore.setState({
      conversations: [],
      streaming: null,
      hydrated: false,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('hydrates persisted conversations newest first and repairs interrupted streams', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.conversations,
      JSON.stringify([
        conversation('old', {
          updatedAt: 5,
          messages: [userMessage('u1', '旧'), assistantMessage('a1')],
        }),
        conversation('new', {updatedAt: 9}),
      ]),
    );

    await useChatStore.getState().hydrate();

    const state = useChatStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.conversations.map(item => item.id)).toEqual(['new', 'old']);
    // 冷启动时仍在 streaming 的历史消息会被修复成 aborted，避免永久转圈。
    const restored = state.conversations[1].messages[1] as AssistantMessage;
    expect(restored.status).toBe('aborted');
  });

  it('prepends a blank conversation and persists it', async () => {
    useChatStore.setState({conversations: [conversation('existing')]});

    const created = useChatStore.getState().createConversation();

    expect(useChatStore.getState().conversations[0].id).toBe(created.id);
    expect(created.messages).toEqual([]);

    await flushConversations();
    expect((await readPersisted()).map(item => item.id)).toContain(created.id);
  });

  it('fills a fallback title only on the first exchange', () => {
    const created = conversation('c1');
    useChatStore.setState({conversations: [created]});

    useChatStore
      .getState()
      .startExchange(
        'c1',
        userMessage('u1', '帮我写一个排序算法'),
        assistantMessage('a1'),
      );

    expect(useChatStore.getState().conversations[0].title).toBe(
      '帮我写一个排序算法',
    );
    expect(useChatStore.getState().conversations[0].titleSource).toBe(
      'fallback',
    );

    const rename = useChatStore.getState().renameConversation;
    rename('c1', '自定义标题');
    useChatStore
      .getState()
      .startExchange(
        'c1',
        userMessage('u2', '再来一个'),
        assistantMessage('a2'),
      );

    expect(useChatStore.getState().conversations[0].title).toBe('自定义标题');
  });

  it('merges stream chunks into the streaming assistant message', () => {
    useChatStore.setState({
      conversations: [conversation('c1', {messages: [assistantMessage('a1')]})],
    });

    useChatStore.getState().appendAssistantChunks('c1', 'a1', [
      {id: 'chunk', choices: [{index: 0, delta: {content: '你'}}]},
      {id: 'chunk', choices: [{index: 0, delta: {content: '好'}}]},
    ]);

    const message = useChatStore.getState().conversations[0]
      .messages[0] as AssistantMessage;
    expect(message.content).toBe('你好');
    expect(message.segments).toEqual([
      {kind: 'text', id: 'a1-seg0', text: '你好'},
    ]);
  });

  it('ignores chunks for unknown conversations or messages', () => {
    useChatStore.setState({
      conversations: [conversation('c1', {messages: [assistantMessage('a1')]})],
    });

    useChatStore
      .getState()
      .appendAssistantChunks('nope', 'a1', [
        {id: 'chunk', choices: [{index: 0, delta: {content: 'x'}}]},
      ]);
    useChatStore
      .getState()
      .appendAssistantChunks('c1', 'nope', [
        {id: 'chunk', choices: [{index: 0, delta: {content: 'x'}}]},
      ]);

    const message = useChatStore.getState().conversations[0]
      .messages[0] as AssistantMessage;
    expect(message.content).toBe('');
  });

  it('applies message updaters through updateAssistantMessage', () => {
    useChatStore.setState({
      conversations: [conversation('c1', {messages: [assistantMessage('a1')]})],
    });

    useChatStore.getState().updateAssistantMessage('c1', 'a1', current => ({
      ...current,
      status: 'error',
      error: '网络连接失败',
    }));

    const message = useChatStore.getState().conversations[0]
      .messages[0] as AssistantMessage;
    expect(message.status).toBe('error');
    expect(message.error).toBe('网络连接失败');
  });

  it('truncates from a message so regenerate can rewrite it and later turns', () => {
    useChatStore.setState({
      conversations: [
        conversation('c1', {
          messages: [
            userMessage('u1', '第一个问题'),
            assistantMessage('a1'),
            userMessage('u2', '追问'),
            assistantMessage('a2'),
          ],
        }),
      ],
    });

    useChatStore.getState().truncateFrom('c1', 'a1');

    expect(
      useChatStore.getState().conversations[0].messages.map(item => item.id),
    ).toEqual(['u1']);
  });

  it('ignores truncation for unknown messages', () => {
    useChatStore.setState({
      conversations: [
        conversation('c1', {
          messages: [userMessage('u1', '问题'), assistantMessage('a1')],
        }),
      ],
    });

    useChatStore.getState().truncateFrom('c1', 'missing');

    expect(useChatStore.getState().conversations[0].messages).toHaveLength(2);
  });

  it('removes only the requested conversation', () => {
    useChatStore.setState({
      conversations: [conversation('c1'), conversation('c2')],
    });

    useChatStore.getState().deleteConversation('c1');

    expect(useChatStore.getState().conversations.map(item => item.id)).toEqual([
      'c2',
    ]);
  });

  it('does not override a user title with the model generated one', () => {
    useChatStore.setState({
      conversations: [
        conversation('c1', {title: '我的标题', titleSource: 'user'}),
      ],
    });

    useChatStore.getState().applyAutoTitle('c1', '模型标题');

    expect(useChatStore.getState().conversations[0].title).toBe('我的标题');
  });

  it('reuses the latest blank conversation on launch', () => {
    const blank = conversation('blank', {updatedAt: 100});
    useChatStore.setState({
      conversations: [
        blank,
        conversation('used', {
          updatedAt: 200,
          messages: [userMessage('u1', 'x')],
        }),
      ],
    });

    expect(ensureLaunchConversation().id).toBe('blank');
  });

  it('creates a conversation when everything else has messages', () => {
    useChatStore.setState({
      conversations: [
        conversation('used', {
          updatedAt: 200,
          messages: [userMessage('u1', 'x')],
        }),
      ],
    });

    const created = ensureLaunchConversation();

    expect(created.id).not.toBe('used');
    expect(useChatStore.getState().conversations).toHaveLength(2);
  });

  it('sorts conversations by recency without mutating the input', () => {
    const input = [
      conversation('a', {updatedAt: 1}),
      conversation('b', {updatedAt: 3}),
      conversation('c', {updatedAt: 2}),
    ];

    expect(sortConversationsByRecency(input).map(item => item.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(input.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });
});
