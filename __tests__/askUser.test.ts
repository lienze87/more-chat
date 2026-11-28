import type {ClientToolCall} from '../src/domain/chat/types';
import {ASK_USER_LIMITS} from '../src/config/appConfig';
import {
  parseAskUserPrompt,
  parseAskUserResult,
  requestUserAnswer,
  useAskUserStore,
} from '../src/features/extensions/askUser';
import {createClientTools} from '../src/features/extensions/clientTools';

jest.mock('../src/adapters/files/fileStorage', () => ({
  fileStorage: {
    keys: async () => [],
    read: async () => undefined,
    write: async () => undefined,
    remove: async () => undefined,
    rename: async () => undefined,
    stat: async () => undefined,
  },
}));

const call = (name: string, args: Record<string, unknown>): ClientToolCall => ({
  id: 'ask_1',
  name,
  argumentsText: JSON.stringify(args),
  status: 'running',
});

const question = {
  question: '把结果保存到哪里？',
  header: '保存位置',
  options: [
    {label: '工作区', description: '可以继续在文件页查看'},
    {label: '只回复', description: '不写入文件'},
  ],
  multi_select: false,
};

beforeEach(() => {
  useAskUserStore.setState({pending: {}});
});

describe('ask_user', () => {
  it('waits for a submitted option and returns it as the tool result', async () => {
    const {execute} = createClientTools([], false);
    const pending = execute(
      call('ask_user', question),
      new AbortController().signal,
    );

    expect(useAskUserStore.getState().pending.ask_1).toMatchObject({
      question: question.question,
      header: '保存位置',
      multiSelect: false,
    });

    useAskUserStore.getState().submit('ask_1', {selected: ['工作区']});

    await expect(pending).resolves.toEqual({
      text: JSON.stringify({
        question: question.question,
        selected: ['工作区'],
        custom: null,
      }),
    });
    expect(useAskUserStore.getState().pending).toEqual({});
  });

  it('supports a custom answer and multi-select', async () => {
    const {execute} = createClientTools([], false);
    const pending = execute(
      call('ask_user', {...question, multi_select: true}),
      new AbortController().signal,
    );

    expect(useAskUserStore.getState().pending.ask_1?.multiSelect).toBe(true);
    useAskUserStore.getState().submit('ask_1', {
      selected: ['工作区'],
      custom: '同时记到日记里',
    });

    await expect(pending).resolves.toMatchObject({
      text: expect.stringContaining('同时记到日记里'),
    });
  });

  it('cancels the pending question when the run is aborted', async () => {
    const controller = new AbortController();
    const {execute} = createClientTools([], false);
    const pending = execute(call('ask_user', question), controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow('提问已取消');
    expect(useAskUserStore.getState().pending).toEqual({});
  });

  it('rejects questions without enough options before touching the queue', async () => {
    const {execute} = createClientTools([], false);
    await expect(
      execute(
        call('ask_user', {
          question: '继续吗？',
          options: [{label: '继续'}],
        }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('至少提供两个选项');
    expect(useAskUserStore.getState().pending).toEqual({});
  });

  it.each([
    {...question, question: '   '},
    {...question, header: '   '},
    {...question, options: [{label: '   '}, {label: '可用选项'}]},
  ])(
    'rejects whitespace-only prompt fields before touching the queue',
    async args => {
      const {execute} = createClientTools([], false);
      const input = call('ask_user', args);
      await expect(
        execute(input, new AbortController().signal),
      ).rejects.toThrow('不能为空');
      expect(useAskUserStore.getState().pending).toEqual({});
      expect(parseAskUserPrompt(input)).toBeNull();
    },
  );

  it('rejects duplicate option labels before touching the queue', async () => {
    const {execute} = createClientTools([], false);
    await expect(
      execute(
        call('ask_user', {
          question: '继续吗？',
          options: [{label: '继续'}, {label: '继续'}],
        }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('选项不能重复');
    await expect(
      execute(
        call('ask_user', {
          question: '继续吗？',
          options: [{label: '继续'}, {label: ' 继续 '}],
        }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('选项不能重复');
    expect(useAskUserStore.getState().pending).toEqual({});
  });

  it('cancels a pending request directly through the store', async () => {
    const promise = requestUserAnswer(
      'direct_1',
      {
        question: '选哪个？',
        options: [{label: 'A'}, {label: 'B'}],
        multiSelect: false,
      },
      new AbortController().signal,
    );
    expect(useAskUserStore.getState().pending.direct_1).toBeDefined();

    useAskUserStore.getState().cancel('direct_1');

    await expect(promise).rejects.toThrow('提问已取消');
  });

  it('resolves as unselected after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const promise = requestUserAnswer(
        'timeout_1',
        {
          question: '选哪个？',
          options: [{label: 'A'}, {label: 'B'}],
          multiSelect: false,
        },
        new AbortController().signal,
        5_000,
      );
      expect(useAskUserStore.getState().pending.timeout_1).toBeDefined();
      expect(useAskUserStore.getState().pending.timeout_1?.timeoutMs).toBe(
        5_000,
      );
      expect(
        useAskUserStore.getState().pending.timeout_1?.expiresAt,
      ).toBeGreaterThan(Date.now());

      jest.advanceTimersByTime(5_000);

      await expect(promise).resolves.toEqual({selected: [], timedOut: true});
      expect(useAskUserStore.getState().pending).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });

  it('pauses the timeout while the user is typing and resumes on blur', async () => {
    jest.useFakeTimers();
    try {
      const promise = requestUserAnswer(
        'pause_1',
        {
          question: '选哪个？',
          options: [{label: 'A'}, {label: 'B'}],
          multiSelect: false,
        },
        new AbortController().signal,
        100,
      );

      useAskUserStore.getState().pause('pause_1');
      const paused = useAskUserStore.getState().pending.pause_1;
      expect(paused?.paused).toBe(true);
      expect(paused?.remainingMs).toBeGreaterThan(0);
      expect(paused?.remainingMs).toBeLessThanOrEqual(100);

      // 暂停期间即使超过总时限，也不会自动结束。
      jest.advanceTimersByTime(1_000);
      expect(useAskUserStore.getState().pending.pause_1).toBeDefined();

      useAskUserStore.getState().resume('pause_1');
      expect(useAskUserStore.getState().pending.pause_1?.paused).toBe(false);

      const remaining =
        useAskUserStore.getState().pending.pause_1?.remainingMs ?? 100;
      jest.advanceTimersByTime(remaining - 1);
      expect(useAskUserStore.getState().pending.pause_1).toBeDefined();

      jest.advanceTimersByTime(1);
      await expect(promise).resolves.toEqual({selected: [], timedOut: true});
      expect(useAskUserStore.getState().pending).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns timed_out from the tool so the run can continue', async () => {
    jest.useFakeTimers();
    try {
      const {execute} = createClientTools([], false);
      const pending = execute(
        call('ask_user', question),
        new AbortController().signal,
      );

      jest.advanceTimersByTime(ASK_USER_LIMITS.timeoutMs);

      const result = await pending;
      expect(JSON.parse(result.text)).toEqual({
        question: question.question,
        selected: [],
        custom: null,
        timed_out: true,
        message: `用户未在 ${ASK_USER_LIMITS.timeoutMs / 1000} 秒内选择，请自行判断后续行动。`,
      });
      expect(useAskUserStore.getState().pending).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });

  it('parses prompts and answers for rendering', () => {
    expect(
      parseAskUserPrompt(
        call('ask_user', {
          question: ' 选一个 ',
          options: [{label: ' A ', description: ' 第一个 '}, {label: 'B'}],
        }),
      ),
    ).toEqual({
      question: '选一个',
      options: [{label: 'A', description: '第一个'}, {label: 'B'}],
      multiSelect: false,
    });
    expect(parseAskUserPrompt(call('ask_user', {}))).toBeNull();
    expect(
      parseAskUserPrompt(
        call('ask_user', {
          question: '选一个',
          options: [{label: 'A'}, {label: 'A'}, {label: 'B'}],
        }),
      ),
    ).toBeNull();
    expect(
      parseAskUserResult(
        JSON.stringify({question: '选一个', selected: ['A'], custom: null}),
      ),
    ).toEqual({question: '选一个', selected: ['A'], custom: null});
    expect(parseAskUserResult('')).toBeNull();
    expect(parseAskUserResult('{}')).toBeNull();
    expect(
      parseAskUserResult(
        JSON.stringify({
          question: '选一个',
          selected: [],
          custom: null,
          timed_out: true,
        }),
      ),
    ).toEqual({
      question: '选一个',
      selected: [],
      custom: null,
      timedOut: true,
    });
  });
});
