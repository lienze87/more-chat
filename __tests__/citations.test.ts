import {
  buildCitedMarkdown,
  codePointIndexToCodeUnitIndex,
  extractCitationSources,
} from '../src/domain/chat/citations';
import type {CitationAnnotation} from '../src/domain/chat/types';

const citation = (
  url: string,
  endIndex: number,
  startIndex = 0,
): CitationAnnotation => ({
  type: 'url_citation',
  url_citation: {
    url,
    title: url,
    start_index: startIndex,
    end_index: endIndex,
  },
});

describe('citation helpers', () => {
  it('converts code point indexes into UTF-16 indexes', () => {
    expect(codePointIndexToCodeUnitIndex('hello', 3)).toBe(3);
    expect(codePointIndexToCodeUnitIndex('a😀b', 2)).toBe(3);
    expect(codePointIndexToCodeUnitIndex('a😀b', 3)).toBe(4);
    expect(codePointIndexToCodeUnitIndex('a😀b', 99)).toBe(4);
  });

  it('injects numbered markers after the cited range', () => {
    const {markdown, sources} = buildCitedMarkdown('Hello world', [
      citation('https://example.com/a', 5),
    ]);
    expect(markdown).toBe('Hello[1](morechat-citation:1) world');
    expect(sources).toEqual([
      {
        number: 1,
        url: 'https://example.com/a',
        title: 'https://example.com/a',
      },
    ]);
  });

  it('reuses numbers for repeated urls and groups markers at one position', () => {
    const {markdown, sources} = buildCitedMarkdown('abcdef', [
      citation('https://a.test', 2),
      citation('https://b.test', 2),
    ]);
    expect(markdown).toBe(
      'ab[1](morechat-citation:1)[2](morechat-citation:2)cdef',
    );
    expect(sources.map(source => source.number)).toEqual([1, 2]);
  });

  it('inserts markers from the end so earlier offsets stay valid', () => {
    const {markdown} = buildCitedMarkdown('abcdef', [
      citation('https://a.test', 2),
      citation('https://b.test', 5),
    ]);
    expect(markdown).toBe(
      'ab[1](morechat-citation:1)cde[2](morechat-citation:2)f',
    );
  });

  it('returns sources without markers when requested', () => {
    expect(
      extractCitationSources([
        citation('https://b.test', 4),
        citation('https://a.test', 2),
        citation('https://b.test', 5),
      ]),
    ).toEqual([
      {number: 1, url: 'https://a.test', title: 'https://a.test'},
      {number: 2, url: 'https://b.test', title: 'https://b.test'},
    ]);
  });
});
