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

export interface FileToolWorkspace {
  listWorkspacePaths: () => Promise<string[]>;
  skillPaths: readonly string[];
  read: (path: string) => Promise<string | undefined>;
  write: (path: string, content: string) => Promise<void>;
}

interface PathPattern {
  path: string;
  pattern: string;
}

function directoryPath(path: string): string {
  return path === '.' ? path : normalizePath(path.replace(/\/$/, ''));
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

function workspaceTextPath(path: string): string {
  const target = textPath(path);
  if (!target.startsWith(`${WORKSPACE}/`)) {
    throw new FileToolError('只能写入 workspace/ 下的文件。');
  }
  return target;
}

function textPath(path: string): string {
  const target = normalizePath(path);
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
  const directory = directoryPath(path);
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
  const end = offset + FILE_LIMITS.directoryPageItems;
  return {
    entries: entries.slice(offset, end).map(([name, type]) => ({name, type})),
    next_offset: end < entries.length ? end : null,
  };
}

async function matchingPaths(
  {path, pattern}: PathPattern,
  workspace: FileToolWorkspace,
) {
  const directory = directoryPath(path);
  const root = directory.split('/')[0];
  const matches = matchFilePattern(normalizePath(pattern));
  const prefix = directory === '.' ? '' : `${directory}/`;
  const paths =
    root === SKILLS_ROOT
      ? workspace.skillPaths
      : await listWorkspace(workspace);
  return (directory === '.' ? paths.concat(workspace.skillPaths) : paths)
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
  const end = args.offset + FILE_LIMITS.directoryPageItems;
  return {
    paths: paths.slice(args.offset, end),
    next_offset: end < paths.length ? end : null,
  };
}

export async function searchText(
  args: PathPattern & {query: string; cursor: SearchCursor},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const paths = (await matchingPaths(args, workspace)).filter(isTextPath);
  return searchFileText({
    paths,
    query: args.query,
    cursor: args.cursor,
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

export async function readTextFile(
  {path, offset}: {path: string; offset: number},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const target = textPath(path);
  const content = requireText(
    await readExistingFile(workspace, target, signal),
    target,
  );
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

function checkWriteContent(content: string): void {
  if (content.includes('\0')) {
    throw new FileToolError('文本内容包含 NUL 字符，无法保存。');
  }
  if (strToU8(content).length > FILE_LIMITS.maxWriteTextBytes) {
    throw new FileToolError(
      `文本文件最多为 ${FILE_LIMITS.maxWriteTextBytes / 1024} KB。`,
    );
  }
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
) {
  const target = workspaceTextPath(path);
  checkWriteContent(content);
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
      return {path: target, changed: false};
    }
    await saveText(workspace, target, content, signal);
    return {path: target, changed: true};
  });
}

function replaceUnique(
  content: string,
  oldText: string,
  newText: string,
): string {
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
  if (content.indexOf(search, index + 1) >= 0) {
    throw new FileToolError(
      'old_text 在文件中匹配多处，请提供更精确的唯一文本片段。',
    );
  }
  const replacement = lineEnding
    ? newText.replace(/\r\n|\n/g, lineEnding)
    : newText;
  return (
    content.slice(0, index) + replacement + content.slice(index + search.length)
  );
}

export async function editTextFile(
  {
    path,
    old_text,
    new_text,
  }: {path: string; old_text: string; new_text: string},
  workspace: FileToolWorkspace,
  signal: AbortSignal,
) {
  const target = workspaceTextPath(path);
  return runMutation(signal, async () => {
    const original = requireText(
      await readExistingFile(workspace, target, signal),
      target,
    );
    const content = replaceUnique(original, old_text, new_text);
    if (content === original) {
      return {path: target, changed: false};
    }
    checkWriteContent(content);
    await saveText(workspace, target, content, signal);
    return {path: target, changed: true};
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
  const target = normalizePath(path);
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
