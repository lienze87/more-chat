import {formatDuration, fallbackTitle, truncate} from '../src/utils/text';

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
