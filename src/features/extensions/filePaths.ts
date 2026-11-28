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

const LOCAL_FILE =
  /\.(?:md|markdown|txt|json|jsonl|csv|tsv|yaml|yml|xml|html|css|ini|toml|log|png|jpe?g|gif|webp)$/i;

/**
 * 把聊天里出现的路径字面量解析成应用内路径。
 *
 * 默认只接受 `workspace/…`、`skills/…` 前缀，避免把普通代码片段（例如
 * `package.json`、`src/config.ts`）误当成可打开的文件。`allowBareName`
 * 仅供已经按文件工具路径约定处理过的参数使用。返回 null 时保持普通行内
 * 代码的渲染方式。
 */
export function toWorkspacePath(
  raw: string,
  {allowBareName = false}: {allowBareName?: boolean} = {},
): string | null {
  const value = raw.trim();
  if (
    !value ||
    value.length > 300 ||
    /\s/.test(value) ||
    value.includes('\\') ||
    value.includes('..') ||
    /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value) ||
    value.startsWith('/') ||
    !LOCAL_FILE.test(value)
  ) {
    return null;
  }
  if (value.startsWith(`${WORKSPACE_ROOT}/`)) {
    return value;
  }
  if (value.startsWith(`${SKILLS_ROOT}/`)) {
    return value;
  }
  if (allowBareName && !value.includes('/')) {
    return `${WORKSPACE_ROOT}/${value}`;
  }
  return null;
}

/**
 * 工具调用参数里的文件路径（path/to/from），用于在工具卡片上打开对应文件。
 *
 * 工具参数已经遵循文件工具的路径约定，因此允许省略 `workspace/` 前缀。
 */
export function pathFromToolArguments(
  args: Record<string, unknown>,
): string | null {
  for (const key of ['path', 'to', 'from'] as const) {
    const value = args[key];
    if (typeof value !== 'string') {
      continue;
    }
    const path = toWorkspacePath(value, {allowBareName: true});
    if (path) {
      return path;
    }
  }
  return null;
}
