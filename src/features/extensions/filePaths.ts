import {strToU8} from 'fflate';
import {FILE_LIMITS, SKILLS_ROOT, WORKSPACE_ROOT} from '../../config/appConfig';

export function relativePath(path: string): string {
  if (
    !path ||
    strToU8(path).length > FILE_LIMITS.maxPathBytes ||
    /[\\:]/.test(path) ||
    Array.from(path).some(char => char < ' ' || char === '\x7f') ||
    path.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error('请使用有效的相对路径，例如 workspace/notes.md。');
  }
  return path;
}

export function localPath(path: string): string {
  const root = path.split('/', 1)[0];
  if (root !== WORKSPACE_ROOT && root !== SKILLS_ROOT) {
    throw new Error('请指定以 workspace/ 或 skills/ 开头的应用内路径。');
  }
  return relativePath(path);
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

export interface SkillFilePath {
  /** Skill 名称，对应 `skills/<名称>/`。 */
  name: string;
  /** Skill 包内的相对路径。 */
  relative: string;
}

/**
 * 把 `skills/<名称>/<相对路径>` 拆成 Skill 名称与包内路径。
 *
 * 工具层与文件预览共用这份解析，避免两处对 Skill 路径的约定漂移。
 */
export function skillPathParts(path: string): SkillFilePath | null {
  if (!path.startsWith(`${SKILLS_ROOT}/`)) {
    return null;
  }
  const [name, ...parts] = path.slice(SKILLS_ROOT.length + 1).split('/');
  const relative = parts.join('/');
  return name && relative ? {name, relative} : null;
}

export function toLocalFilePath(path: string): string | null {
  if (!path.startsWith(`${WORKSPACE_ROOT}/`) && !skillPathParts(path)) {
    return null;
  }
  try {
    return localPath(path);
  } catch {
    return null;
  }
}

/** 行内代码和工具参数只为常见的文件类型生成打开入口。 */
export function toLocalFileLink(path: string): string | null {
  return isTextPath(path) || imageMimeType(path) ? toLocalFilePath(path) : null;
}

/** Markdown 解析器会对链接目标中的中文和空格做百分号编码。 */
export function localFilePathFromHref(href: string): string | null {
  try {
    return toLocalFilePath(decodeURIComponent(href));
  } catch {
    return null;
  }
}

export function pathFromToolArguments(
  args: Record<string, unknown>,
): string | null {
  for (const key of ['path', 'to', 'from'] as const) {
    const value = args[key];
    if (typeof value !== 'string') {
      continue;
    }
    const path = toLocalFileLink(value);
    if (path) {
      return path;
    }
  }
  return null;
}
