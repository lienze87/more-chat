import type {
  AssistantMessage,
  Conversation,
  UserMessage,
} from '../src/domain/chat/types';
import {conversationSchema} from '../src/domain/chat/schema';
import {createAssistantMessage} from '../src/features/chat/streamReducer';

const user = (): UserMessage => ({
  id: 'u1',
  role: 'user',
  content: '你好',
  createdAt: 1,
  status: 'complete',
  reminder: '2026-11-22,星期日,上海,App,中文',
  envInfo: '<env_info>测试</env_info>',
});

const assistant = (): AssistantMessage => ({
  ...createAssistantMessage('a1', 2),
  content: '你好！',
  status: 'complete',
  segments: [{kind: 'text', id: 'a1-seg0', text: '你好！'}],
});

const conversation = (): Conversation => ({
  id: 'c1',
  title: '测试对话',
  titleSource: 'fallback',
  createdAt: 1,
  updatedAt: 2,
  messages: [user(), assistant()],
});

describe('conversationSchema', () => {
  it('accepts a fully populated current conversation', () => {
    const value = conversation();
    expect(conversationSchema.parse(value)).toEqual(value);
  });

  it('strips fields outside the persisted contract', () => {
    const parsed = conversationSchema.parse({
      ...conversation(),
      legacyField: true,
    });

    expect(parsed).not.toHaveProperty('legacyField');
  });

  it.each([
    ['invalid title source', {...conversation(), titleSource: 'legacy'}],
    [
      'missing reminder',
      {
        ...conversation(),
        messages: [{...user(), reminder: undefined}],
      },
    ],
    [
      'missing assistant tool arrays',
      {
        ...conversation(),
        messages: [
          user(),
          {
            ...assistant(),
            clientToolCalls: undefined,
          },
        ],
      },
    ],
    [
      'invalid thinking timestamp',
      {
        ...conversation(),
        messages: [
          user(),
          {
            ...assistant(),
            segments: [
              {
                kind: 'thinking',
                id: 't1',
                step: 0,
                text: '思考',
                startedAt: 'yesterday',
              },
            ],
          },
        ],
      },
    ],
    [
      'invalid usage shape',
      {
        ...conversation(),
        messages: [
          user(),
          {
            ...assistant(),
            usage: {prompt_tokens: 'one'},
          },
        ],
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(conversationSchema.safeParse(value).success).toBe(false);
  });
});
