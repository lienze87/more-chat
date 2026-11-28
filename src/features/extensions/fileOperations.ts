import {toByteArray} from 'base64-js';
import {strToU8} from 'fflate';
import {FILE_LIMITS, WORKSPACE_ROOT as WORKSPACE} from '../../config/appConfig';
import {
  matchFilePattern,
  searchFileText,
  type SearchCursor,
} from './fileSearch';
import {imageMimeType, isTextPath, relativePath} from './filePaths';
import {FileToolError} from './fileToolError';

export const SKILLS_ROOT = 'skills';

export interface FileStat {
  size: number;
  mtime?: number;
}

export interface FileToolWorkspace {
  listWorkspacePaths: () => Promise<string[]>;
  skillPaths: readonly string[];
  read: (path: string) => Promise<string | undefined>;
  write: (path: string, content: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  rename: (from: string, to: string, overwrite: boolean) => Promise<void>;
  stat?: (path: string) => Promise<FileStat | undefined>;
}

interface PathPattern {
  path: string;
  pattern: string;
}

function normalizePath(path: string): string {
  try {
    return relativePath(path);
  } catch (error) {
    if (error instanceof Error) {
      throw new FileToolError(error.message);
    }
    throw error;
  }
}

// 省略前缀时按 workspace/ 解析：notes.md 等价于 workspace/notes.md。
// skills/ 和 . 保留原义，供只读 Skill 和根目录列出使用。
function resolvePath(path: string): string {
  const target = path.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  if (target === '.') {
    return target;
  }
  if (target === WORKSPACE || target === SKILLS_ROOT) {
    return target;
  }
  if (
    target.startsWith(`${WORKSPACE}/`) ||
    target.startsWith(`${SKILLS_ROOT}/`)
  ) {
    return normalizePath(target);
  }
  return normalizePath(`${WORKSPACE}/${target}`);
}

function workspaceTextPath(path: string): string {
  const target = textPath(path);
  if (!target.startsWith(`${WORKSPACE}/`)) {
    throw new FileToolError('只能写入 workspace/ 下的文件，skills/ 为只读。');
  }
  return target;
}

function workspaceTarget(path: string, action: string): string {
  const target = resolvePath(path);
  if (target === '.' || target === WORKSPACE) {
    throw new FileToolError('不能操作工作区根目录。');
  }
  if (!target.startsWith(`${WORKSPACE}/`)) {
    throw new FileToolError(
      `只能${action} workspace/ 下的文件，skills/ 为只读。`,
    );
  }
  return target;
}

function textPath(path: string): string {
  const target = resolvePath(path);
  if (target === '.' || target === WORKSPACE) {
    throw new FileToolError(
      '请指定具体文件路径，例如 notes.md 或 workspace/notes.md。',
    );
  }
  if (!isTextPath(target)) {
    throw new FileToolError(
      '请选择 Markdown、JSON 或其他支持的 UTF-8 文本文件。',
    );
  }
  return target;
}

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('工具调用已停止。');
  }
}

async function listWorkspace(workspace: FileToolWorkspace) {
  try {
    return await workspace.listWorkspacePaths();
  } catch (cause) {
    throw new FileToolError('无法检查工作区文件，请重试。', {cause});
  }
}

async function readValue(workspace: FileToolWorkspace, path: string) {
  try {
    return await workspace.read(path);
  } catch (cause) {
    throw new FileToolError(`读取文件失败：${path}`, {cause});
  }
}

async function readExistingFile(
  workspace: FileToolWorkspace,
  path: string,
  signal: AbortSignal,
): Promise<string> {
  checkCancellation(signal);
  const content = await readValue(workspace, path);
  checkCancellation(signal);
  if (content !== undefined) {
    return content;
  }
  const paths = path.startsWith(`${WORKSPACE}/`)
    ? await listWorkspace(workspace)
    : workspace.skillPaths;
  checkCancellation(signal);
  if (paths.some(file => file.startsWith(`${path}/`))) {
    throw new FileToolError(`目标是目录，无法按文件读取：${path}`);
  }
  throw new FileToolError(`文件不存在：${path}`);
}

export async function listDirectory(
  {path, offset}: {path: string; offset: number},
  workspace: FileToolWorkspace,
) {
  const directory = resolvePath(path);
  const prefix = directory === '.' ? '' : `${directory}/`;
  const paths =
    directory === '.'
      ? [`${SKILLS_ROOT}/`, `${WORKSPACE}/`]
      : directory.split('/')[0] === WORKSPACE
        ? await listWorkspace(workspace)
        : workspace.skillPaths;
  const children = new Map<string, 'file' | 'directory'>();
  for (const file of paths) {
    if (file.startsWith(prefix)) {
      const [name, ...rest] = file.slice(prefix.length).split('/');
      children.set(name, rest.length ? 'directory' : 'file');
    }
  }
  if (!children.size && !['.', WORKSPACE, SKILLS_ROOT].includes(directory)) {
    throw new FileToolError(`目录不存在：${directory}`);
  }
  const entries = [...children].sort(([a], [b]) => a.localeCompare(b));
  if (offset > entries.length) {
    throw new FileToolError(
      `offset 超出目录项，请使用 next_offset：${directory}`,
    );
  }
  const end = offset + FILE_LIMITS.directoryPageItems;
  const page = await Promise.all(
    entries.slice(offset, end).map(async ([name, type]) => {
      if (type === 'directory') {
        return {name, type};
      }
      const entry: {
        name: string;
        type: 'file';
        size?: number;
        mtime?: string;
      } = {name, type};
      const target = directory === '.' ? name : `${directory}/${name}`;
      const metadata = await entryMetadata(workspace, target);
      if (metadata) {
        entry.size = metadata.size;
        if (metadata.mtime !== undefined) {
          entry.mtime = metadata.mtime;
        }
      }
      return entry;
    }),
  );
  return {
    entries: page,
    total: entries.length,
    next_offset: end < entries.length ? end : null,
  };
}

async function entryMetadata(
  workspace: FileToolWorkspace,
  path: string,
): Promise<{size: number; mtime?: string} | undefined> {
  if (!workspace.stat) {
    return undefined;
  }
  try {
    const stat = await workspace.stat(path);
    if (!stat) {
      return undefined;
    }
    return {
      size: stat.size,
      ...(stat.mtime !== undefined && Number.isFinite(stat.mtime)
        ? {mtime: new Date(stat.mtime).toISOString()}
        : {}),
    };
  } catch {
    return undefined;
  }
}

async function matchingPaths(
  {path, pattern}: PathPattern,
  workspace: FileToolWorkspace,
) {
  const directory = resolvePath(path);
  const root = directory.split('/')[0];
  const matches = matchFilePattern(normalizePath(pattern));
  const prefix = directory === '.' ? '' : `${directory}/`;
  const paths =
    root === SKILLS_ROOT
      ? workspace.skillPaths
      : await listWorkspace(workspace);
  const scoped = directory === '.' ? paths.concat(workspace.skillPaths) : paths;
  if (!['.', WORKSPACE, SKILLS_ROOT].includes(directory)) {
    const directoryPrefix = `${directory}/`;
    if (scoped.includes(directory)) {
      throw new FileToolError(`目标是文件，无法作为目录检索：${directory}`);
    }
    if (!scoped.some(file => file.startsWith(directoryPrefix))) {
      throw new FileToolError(`目录不存在：${directory}`);
    }
  }
  return scoped
    .filter(
      file => file.startsWith(prefix) && matches(file.slice(prefix.length)),
    )
    .sort();
}

export async function findFiles(
  args: PathPattern & {offset: number},
  workspace: FileToolWorkspace,
) {
  const paths = await matchingPaths(args, workspace);
  if (args.offset > paths.length) {
    throw new FileToolError(
      `offset 超出结果数，请使用 next_offset：${args.path}`,
    );
  }
  const end = args.offset + FILE_LIMITS.directoryPageItems;
  return {
    paths: paths.slice(args.offset, end),
    total: paths.length,
    next_offset: end < paths.length ? end : null,
  };
}

export async function deletePath(
  {path, recursive}: {path: string; recursive: boolean},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const target = workspaceTarget(path, '删除');
  return runMutation(signal, async () => {
    const paths = await listWorkspace(workspace);
    checkCancellation(signal);
    const affected = paths
      .filter(file => file === target || file.startsWith(`${target}/`))
      .sort();
    if (!affected.length) {
      throw new FileToolError(`文件或目录不存在：${target}`);
    }
    if (affected.some(file => file !== target) && !recursive) {
      throw new FileToolError(
        `目标是目录，删除目录需设置 recursive: true：${target}`,
      );
    }
    const deleted: string[] = [];
    for (const file of affected) {
      checkCancellation(signal);
      try {
        await workspace.remove(file);
      } catch (cause) {
        throw new FileToolError(
          `删除文件失败：${file}。已删除：${deleted.length ? deleted.join('、') : '无'}`,
          {cause},
        );
      }
      deleted.push(file);
    }
    return {deleted, count: deleted.length};
  });
}

export async function movePath(
  {from, to, overwrite}: {from: string; to: string; overwrite: boolean},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const source = workspaceTarget(from, '移动');
  const target = workspaceTarget(to, '移动到');
  if (source === target) {
    throw new FileToolError('源路径和目标路径相同。');
  }
  return runMutation(signal, async () => {
    const paths = await listWorkspace(workspace);
    checkCancellation(signal);
    if (!paths.includes(source)) {
      if (paths.some(file => file.startsWith(`${source}/`))) {
        throw new FileToolError(`源路径是目录，暂不支持移动目录：${source}`);
      }
      throw new FileToolError(`源文件不存在：${source}`);
    }
    if (
      paths.some(
        file => file.startsWith(`${target}/`) || target.startsWith(`${file}/`),
      )
    ) {
      throw new FileToolError(`目标与已有文件或目录冲突：${target}`);
    }
    if (paths.includes(target) && !overwrite) {
      throw new FileToolError(
        `目标文件已存在，请设置 overwrite: true：${target}`,
      );
    }
    try {
      await workspace.rename(source, target, overwrite);
    } catch (cause) {
      throw new FileToolError(`移动文件失败：${source} → ${target}`, {cause});
    }
    checkCancellation(signal);
    return {from: source, to: target};
  });
}

export async function searchText(
  args: PathPattern & {
    query: string;
    cursor: SearchCursor;
    case_sensitive?: boolean;
  },
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const paths = (await matchingPaths(args, workspace)).filter(isTextPath);
  return searchFileText({
    paths,
    query: args.query,
    cursor: args.cursor,
    caseSensitive: args.case_sensitive ?? true,
    read: async path => {
      const content = await readValue(workspace, path);
      return content?.includes('\0') ? undefined : content;
    },
    signal,
  });
}

function requireText(content: string, path: string): string {
  if (content.includes('\0')) {
    throw new FileToolError(`目标疑似二进制文件，无法按文本处理：${path}`);
  }
  return content;
}

function readTail(
  content: string,
  count: number,
  path: string,
): {
  content: string;
  start_line: number;
  end_line: number;
  next_offset: null;
} {
  if (!content) {
    return {content: '', start_line: 0, end_line: 0, next_offset: null};
  }
  const starts = [0];
  const newline = /\r\n|[\r\n]/g;
  while (newline.exec(content)) {
    starts.push(newline.lastIndex);
  }
  const total = Math.max(
    1,
    starts.length - (content.endsWith('\n') || content.endsWith('\r') ? 1 : 0),
  );
  const startLine = Math.max(0, total - count);
  const start = starts[startLine] ?? 0;
  const end = total < starts.length ? starts[total] : content.length;
  const tail = content.slice(start, end);
  if (tail.length > FILE_LIMITS.textPageChars) {
    throw new FileToolError(
      `tail_lines 结果超过单页字符上限，请减小 tail_lines：${path}`,
    );
  }
  return {
    content: tail,
    start_line: startLine + 1,
    end_line: total,
    next_offset: null,
  };
}

export async function readTextFile(
  {
    path,
    offset,
    tail_lines,
  }: {path: string; offset: number; tail_lines?: number},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const target = textPath(path);
  const content = requireText(
    await readExistingFile(workspace, target, signal),
    target,
  );
  if (tail_lines !== undefined) {
    return readTail(content, tail_lines, target);
  }
  if (offset > content.length) {
    throw new FileToolError(
      `offset 超出文件长度，请使用 next_offset：${target}`,
    );
  }
  let end = Math.min(offset + FILE_LIMITS.textPageChars, content.length);
  const lastUnit = content.charCodeAt(end - 1);
  if (end < content.length && lastUnit >= 0xd800 && lastUnit <= 0xdbff) {
    end -= 1;
  }
  return {
    content: content.slice(offset, end),
    next_offset: end < content.length ? end : null,
  };
}

function checkWriteContent(content: string): number {
  if (content.includes('\0')) {
    throw new FileToolError('文本内容包含 NUL 字符，无法保存。');
  }
  const bytes = strToU8(content).length;
  if (bytes > FILE_LIMITS.maxWriteTextBytes) {
    throw new FileToolError(
      `文本文件最多为 ${FILE_LIMITS.maxWriteTextBytes / 1024} KB。`,
    );
  }
  return bytes;
}

// 整个工作区串行写入，因为父子路径也可能互相冲突。
let pendingMutation = Promise.resolve();
function runMutation<T>(signal: AbortSignal, operation: () => Promise<T>) {
  const run = pendingMutation.then(() => {
    checkCancellation(signal);
    return operation();
  });
  pendingMutation = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function saveText(
  workspace: FileToolWorkspace,
  path: string,
  content: string,
  signal: AbortSignal,
) {
  checkCancellation(signal);
  try {
    await workspace.write(path, content);
  } catch (cause) {
    throw new FileToolError(`写入文件失败：${path}。请检查文件状态后再试。`, {
      cause,
    });
  }
}

export async function writeTextFile(
  {
    path,
    content,
    overwrite,
  }: {path: string; content: string; overwrite: boolean},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
  maxBytes = Number.POSITIVE_INFINITY,
) {
  const target = workspaceTextPath(path);
  const bytes = checkWriteContent(content);
  return runMutation(signal, async () => {
    const paths = await listWorkspace(workspace);
    checkCancellation(signal);
    if (
      paths.some(
        file => file.startsWith(`${target}/`) || target.startsWith(`${file}/`),
      )
    ) {
      throw new FileToolError(`路径与已有文件或目录冲突：${target}`);
    }
    const original = await readValue(workspace, target);
    checkCancellation(signal);
    if (original !== undefined && !overwrite) {
      throw new FileToolError(
        `文件已存在，请使用 edit_file 或将 overwrite 设为 true：${target}`,
      );
    }
    if (original === content) {
      return {path: target, changed: false, bytes};
    }
    if (bytes > maxBytes) {
      throw new FileToolError(
        `本次脚本写入总量将超过 ${FILE_LIMITS.maxWriteBytesPerScript / 1024} KB 上限，请分次执行。`,
      );
    }
    await saveText(workspace, target, content, signal);
    return {path: target, changed: true, bytes};
  });
}

function replaceText(
  content: string,
  oldText: string,
  newText: string,
  all: boolean,
): {content: string; replaced: number} {
  if (!oldText) {
    throw new FileToolError('old_text 不能为空。');
  }
  const hasCrLf = content.includes('\r\n');
  const hasLf = content.replaceAll('\r\n', '').includes('\n');
  const lineEnding = hasCrLf === hasLf ? undefined : hasCrLf ? '\r\n' : '\n';
  let search = oldText;
  let index = content.indexOf(search);
  if (index < 0 && lineEnding) {
    search = search.replace(/\r\n|\n/g, lineEnding);
    index = content.indexOf(search);
  }
  if (index < 0) {
    throw new FileToolError('old_text 未在文件中找到，请重新读取后再试。');
  }
  if (!all && content.indexOf(search, index + 1) >= 0) {
    throw new FileToolError(
      'old_text 在文件中匹配多处，请提供更精确的唯一文本片段，或设置 all: true。',
    );
  }
  const replacement = lineEnding
    ? newText.replace(/\r\n|\n/g, lineEnding)
    : newText;
  const occurrences = content.split(search).length - 1;
  return {
    content: all
      ? content.split(search).join(replacement)
      : content.slice(0, index) +
        replacement +
        content.slice(index + search.length),
    replaced: occurrences,
  };
}

export async function editTextFile(
  {
    path,
    old_text,
    new_text,
    all = false,
  }: {path: string; old_text: string; new_text: string; all?: boolean},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const target = workspaceTextPath(path);
  return runMutation(signal, async () => {
    const original = requireText(
      await readExistingFile(workspace, target, signal),
      target,
    );
    const result = replaceText(original, old_text, new_text, all);
    if (result.content === original) {
      return {path: target, changed: false, replaced: result.replaced};
    }
    checkWriteContent(result.content);
    await saveText(workspace, target, result.content, signal);
    return {path: target, changed: true, replaced: result.replaced};
  });
}

function hasImageSignature(base64: string, mime: string): boolean {
  const head = base64.slice(0, 16);
  if (!head || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(head)) {
    return false;
  }
  const bytes = toByteArray(head);
  const signature = String.fromCharCode(...bytes);
  switch (mime) {
    case 'image/png':
      return signature.startsWith('\x89PNG\r\n\x1a\n');
    case 'image/jpeg':
      return signature.startsWith('\xff\xd8\xff');
    case 'image/gif':
      return /^GIF8[79]a/.test(signature);
    case 'image/webp':
      return signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP';
    default:
      return false;
  }
}

export async function readImageFile(
  {path}: {path: string},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
  budget: {remainingChars: number},
) {
  const target = resolvePath(path);
  const mime = imageMimeType(target);
  if (!mime) {
    throw new FileToolError('请选择 PNG、JPEG、GIF 或 WebP 图片。');
  }
  const content = await readExistingFile(workspace, target, signal);
  if (content.length > budget.remainingChars) {
    throw new FileToolError('本轮对话读取的图片已达到大小上限。');
  }
  if (!hasImageSignature(content, mime)) {
    throw new FileToolError(
      `图片内容与文件扩展名不匹配或文件已损坏：${target}`,
    );
  }
  budget.remainingChars -= content.length;
  return {path: target, mime, content};
}
