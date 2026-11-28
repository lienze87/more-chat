import {chatCompletionsUrl} from '../src/adapters/api/chatClient';
import {DEFAULT_BASE_URL} from '../src/domain/settings/types';

describe('chatCompletionsUrl', () => {
  it('falls back to the shared default base url', () => {
    expect(chatCompletionsUrl('')).toBe(`${DEFAULT_BASE_URL}/chat/completions`);
    expect(chatCompletionsUrl('   ')).toBe(
      `${DEFAULT_BASE_URL}/chat/completions`,
    );
  });

  it('trims whitespace and trailing slashes', () => {
    expect(chatCompletionsUrl(' https://example.com/v1/ ')).toBe(
      'https://example.com/v1/chat/completions',
    );
  });

  it('keeps an explicit completions endpoint', () => {
    expect(chatCompletionsUrl('https://example.com/chat/completions')).toBe(
      'https://example.com/chat/completions',
    );
  });
});
