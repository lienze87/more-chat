import {strToU8} from 'fflate';

export function relativePath(path: string): string {
  if (
    !path ||
    strToU8(path).length > 170 ||
    /[\\:]/.test(path) ||
    Array.from(path).some(char => char < ' ' || char === '\x7f') ||
    path.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error('请使用有效的相对路径，例如 workspace/notes.md。');
  }
  return path;
}

export const isTextPath = (path: string): boolean =>
  /\.(?:md|markdown|txt|json|jsonl|csv|tsv|yaml|yml|xml|html|css|ini|toml|log)$/i.test(
    path,
  );

export function imageMimeType(path: string): string | undefined {
  const extension = path.split('.').at(-1)?.toLowerCase();
  switch (extension) {
    case 'png':
    case 'gif':
    case 'webp':
      return `image/${extension}`;
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return undefined;
  }
}
