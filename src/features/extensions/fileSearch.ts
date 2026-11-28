import {escape, Minimatch} from 'minimatch';
import {FILE_SEARCH_LIMITS} from '../../config/appConfig';

export function matchFilePattern(pattern: string): (path: string) => boolean {
  const glob = pattern
    .split(/([*?])/)
    .map(part => (part === '*' || part === '?' ? part : escape(part)))
    .join('');
  const matcher = new Minimatch(glob, {
    dot: true,
    nobrace: true,
    nocomment: true,
    noext: true,
    nonegate: true,
    platform: 'linux',
  });
  return path => matcher.match(path);
}

export interface SearchCursor {
  file: number;
  line: number;
  offset: number;
}

export async function searchFileText({
  paths,
  query,
  cursor,
  read,
  signal,
  caseSensitive = true,
}: {
  paths: string[];
  query: string;
  cursor: SearchCursor;
  read: (path: string) => Promise<string | undefined>;
  signal: AbortSignal;
  caseSensitive?: boolean;
}) {
  const matches: {path: string; line: number; text: string}[] = [];
  const insensitive = caseSensitive
    ? undefined
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  let {file, line, offset} = cursor;
  const {
    matchesPerPage,
    filesPerPage,
    scanCharsPerPage,
    previewChars,
    previewCharsBeforeMatch,
  } = FILE_SEARCH_LIMITS;
  const lastFile = Math.min(file + filesPerPage, paths.length);
  let chars = 0;
  while (
    file < lastFile &&
    matches.length < matchesPerPage &&
    chars < scanCharsPerPage
  ) {
    if (signal.aborted) {
      throw new Error('工具调用已停止。');
    }
    const path = paths[file];
    const content = (await read(path)) ?? '';
    if (signal.aborted) {
      throw new Error('工具调用已停止。');
    }
    const newline = /\r\n|[\r\n]/g;
    newline.lastIndex = offset;
    while (
      offset < content.length &&
      matches.length < matchesPerPage &&
      chars < scanCharsPerPage
    ) {
      const boundary = newline.exec(content);
      const text = content.slice(offset, boundary?.index ?? content.length);
      const nextOffset = boundary ? newline.lastIndex : content.length;
      chars += nextOffset - offset;
      offset = nextOffset;
      line += 1;
      const index = insensitive
        ? (insensitive.exec(text)?.index ?? -1)
        : text.indexOf(query);
      if (index >= 0) {
        const start = Math.max(0, index - previewCharsBeforeMatch);
        const end = start + previewChars;
        matches.push({
          path,
          line,
          text: `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
        });
      }
    }
    if (offset >= content.length) {
      file += 1;
      line = 0;
      offset = 0;
    }
  }
  return {
    matches,
    next_cursor: file < paths.length ? {file, line, offset} : null,
  };
}
