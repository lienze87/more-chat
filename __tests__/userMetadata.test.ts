import {
  buildEnvInfo,
  buildLatestReminder,
  composeUserContent,
  formatLocalDate,
  formatWeekday,
} from '../src/domain/chat/userMetadata';

describe('latest_reminder', () => {
  const date = new Date(2026, 10, 22, 9, 30);

  it('formats a zero padded local date', () => {
    expect(formatLocalDate(date)).toBe('2026-11-22');
  });

  it('localizes the weekday', () => {
    expect(formatWeekday(date, '中文')).toBe('星期日');
    expect(formatWeekday(date, 'English')).toBe('Sunday');
  });

  it('builds the documented five field format', () => {
    expect(
      buildLatestReminder(date, {
        language: '中文',
        location: '上海',
      }),
    ).toBe('2026-11-22,星期日,上海,App,中文');
  });

  it('keeps commas inside the location and allows an empty one', () => {
    expect(
      buildLatestReminder(date, {
        language: 'English',
        location: 'Singapore, SG',
      }),
    ).toBe('2026-11-22,Sunday,Singapore, SG,App,English');

    expect(buildLatestReminder(date, {language: '中文', location: '  '})).toBe(
      '2026-11-22,星期日,,App,中文',
    );
  });
});

describe('env_info', () => {
  it('describes the client, platform and enabled tools', () => {
    expect(
      buildEnvInfo({
        clientVersion: '0.1.0',
        platform: 'android',
        capabilities: ['联网搜索', '阅读链接'],
      }),
    ).toBe(
      [
        '<env_info>',
        '客户端: MoreChat 0.1.0',
        '平台: App（Android）',
        '可用工具: 联网搜索、阅读链接',
        '</env_info>',
      ].join('\n'),
    );
  });

  it('marks the tool list as empty instead of leaving it blank', () => {
    const envInfo = buildEnvInfo({
      clientVersion: '0.1.0',
      platform: 'web',
      capabilities: [],
    });

    expect(envInfo).toContain('平台: Web（浏览器）');
    expect(envInfo).toContain('可用工具: 无');
  });
});

describe('composeUserContent', () => {
  it('wraps the request in a user_query tag', () => {
    expect(composeUserContent('你好')).toBe(
      '<user_query>\n你好\n</user_query>',
    );
  });

  it('prefixes the env snapshot when one was stored', () => {
    expect(composeUserContent('你好', '  <env_info>快照</env_info>\n')).toBe(
      '<env_info>快照</env_info>\n\n<user_query>\n你好\n</user_query>',
    );
  });
});
