import {
  formatDuration,
  formatMessageTime,
  formatTokenCount,
  fallbackTitle,
  truncate,
} from '../src/utils/text';

const at = (value: string): number => new Date(value).getTime();

describe('formatMessageTime', () => {
  it('shows the clock time for same-day messages', () => {
    expect(
      formatMessageTime(at('2026-11-22T09:05:00'), at('2026-11-22T20:34:00')),
    ).toBe('09:05');
  });

  it('adds the date for older messages', () => {
    expect(
      formatMessageTime(at('2026-11-20T23:59:00'), at('2026-11-22T09:00:00')),
    ).toBe('11月20日 23:59');
  });

  it('treats a different year as a different day', () => {
    expect(
      formatMessageTime(at('2025-11-22T09:05:00'), at('2026-11-22T09:05:00')),
    ).toBe('11月22日 09:05');
  });
});

describe('formatTokenCount', () => {
  it('groups thousands', () => {
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1234)).toBe('1,234');
    expect(formatTokenCount(1234567)).toBe('1,234,567');
  });
});

describe('formatDuration', () => {
  it('shows seconds under a minute', () => {
    expect(formatDuration(4000)).toBe('4 秒');
  });

  it('keeps at least one second', () => {
    expect(formatDuration(0)).toBe('1 秒');
  });

  it('adds minutes for long thinking', () => {
    expect(formatDuration(60000)).toBe('1 分钟');
    expect(formatDuration(65000)).toBe('1 分 5 秒');
  });
});

describe('title helpers', () => {
  it('falls back to a placeholder for blank titles', () => {
    expect(fallbackTitle('   ')).toBe('新对话');
  });

  it('collapses whitespace and truncates long titles', () => {
    expect(truncate('  a  \n b  ', 10)).toBe('a b');
    expect(truncate('x'.repeat(40), 10)).toBe(`${'x'.repeat(10)}…`);
  });
});
