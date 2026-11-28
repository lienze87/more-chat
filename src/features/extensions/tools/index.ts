import {z} from 'zod';
import {
  FILE_LIMITS,
  FILE_SEARCH_LIMITS,
  JAVASCRIPT_LIMITS,
  WRITE_TOOL_INPUT_LIMIT,
} from '../../../config/appConfig';
import {
  deletePath,
  editTextFile,
  findFiles,
  listDirectory,
  movePath,
  readImageFile,
  readTextFile,
  searchText,
  writeTextFile,
  type FileToolWorkspace,
} from '../fileOperations';

export interface FileToolContext {
  signal: AbortSignal;
  workspace: FileToolWorkspace;
  script?: {writeCount: number; savedPaths: string[]};
  imageBudget: {remainingChars: number};
  runScript: (code: string, signal: AbortSignal) => Promise<string>;
}

interface FileToolResult {
  text: string;
  imageUrl?: string;
}

export interface FileToolDefinition<Schema extends z.ZodType = z.ZodType> {
  description: string;
  parameters: Schema;
  execute(
    args: z.output<Schema>,
    context: FileToolContext,
  ): Promise<FileToolResult>;
  programmatic?: boolean;
  inputLimit?: number;
  requiresImages?: boolean;
}

const stringParam = z.string({error: '必须是字符串。'});
const pathParam = stringParam
  .min(1, '不能为空。')
  .describe('工作区内的相对路径');
const directory = pathParam
  .default('.')
  .describe('目录的相对路径，默认是应用内根目录');
const offset = z
  .int({error: '必须是非负整数。'})
  .nonnegative({error: '必须是非负整数。'})
  .default(0)
  .describe('从 0 开始，默认 0');
const pattern = stringParam
  .default('**')
  .describe(
    '相对于 path 的文件路径模式。* 匹配一段内任意字符，? 匹配一个字符，独立的 ** 匹配任意层级。默认 **。',
  );

const listDirectorySchema = z.strictObject({path: directory, offset});

async function executeListDirectory(
  args: z.output<typeof listDirectorySchema>,
  {workspace}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await listDirectory(args, workspace))};
}

const listDirectoryDefinition = {
  description: `列出目录的直接子项，返回 {entries, total, next_offset}。文件项含 size（字节）和 mtime（ISO 时间，Web 端无 mtime）。每页最多 ${FILE_LIMITS.directoryPageItems} 项。`,
  parameters: listDirectorySchema,
  execute: executeListDirectory,
  programmatic: true,
} satisfies FileToolDefinition<typeof listDirectorySchema>;

const findFilesSchema = z.strictObject({path: directory, pattern, offset});

async function executeFindFiles(
  args: z.output<typeof findFilesSchema>,
  {workspace}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await findFiles(args, workspace))};
}

const findFilesDefinition = {
  description: `递归查找匹配路径模式的本地文件，返回 {paths, total, next_offset}，每页最多 ${FILE_LIMITS.directoryPageItems} 项。path 默认是应用内根目录，不存在时报错。`,
  parameters: findFilesSchema,
  execute: executeFindFiles,
  programmatic: true,
} satisfies FileToolDefinition<typeof findFilesSchema>;

const deletePathSchema = z.strictObject({
  path: pathParam,
  recursive: z.boolean().default(false),
});

async function executeDeletePath(
  args: z.output<typeof deletePathSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await deletePath(args, workspace, signal))};
}

const deletePathDefinition = {
  description:
    '删除 workspace/ 下的文件或目录，返回 {deleted, count}。删除目录需设置 recursive: true；skills/ 只读。',
  parameters: deletePathSchema,
  execute: executeDeletePath,
  programmatic: true,
} satisfies FileToolDefinition<typeof deletePathSchema>;

const movePathSchema = z.strictObject({
  from: pathParam,
  to: pathParam,
  overwrite: z.boolean().default(false),
});

async function executeMovePath(
  args: z.output<typeof movePathSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await movePath(args, workspace, signal))};
}

const movePathDefinition = {
  description:
    '移动或重命名 workspace/ 下的文本文件，返回 {from, to}。目标已存在需设置 overwrite；skills/ 只读。',
  parameters: movePathSchema,
  execute: executeMovePath,
  programmatic: true,
} satisfies FileToolDefinition<typeof movePathSchema>;

const cursorError = '请使用上一次搜索返回的 next_cursor。';
const queryError = `必须是 1 到 ${FILE_SEARCH_LIMITS.maxQueryLength} 字符的单行文本。`;
const cursorIndex = z
  .int({error: cursorError})
  .nonnegative({error: cursorError});
const cursor = z
  .strictObject(
    {file: cursorIndex, line: cursorIndex, offset: cursorIndex},
    {error: cursorError},
  )
  .default({file: 0, line: 0, offset: 0})
  .describe('原样传入上一次同参数搜索的 next_cursor，首次省略');
const searchTextSchema = z.strictObject({
  path: directory,
  pattern,
  query: stringParam
    .min(1, queryError)
    .max(FILE_SEARCH_LIMITS.maxQueryLength, queryError)
    .regex(/^[^\r\n]*$/, queryError)
    .describe('要匹配的单行文本'),
  case_sensitive: z
    .boolean()
    .default(true)
    .describe('默认区分大小写；false 时忽略大小写'),
  cursor,
});

async function executeSearchText(
  args: z.output<typeof searchTextSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await searchText(args, workspace, signal))};
}

const searchTextDefinition = {
  description:
    '递归搜索 UTF-8 文本文件中的字面量，默认区分大小写（case_sensitive: false 可忽略）。返回 {matches: [{path, line, text}], next_cursor}。即使本页没有命中，只要 next_cursor 非 null 就可继续。',
  parameters: searchTextSchema,
  execute: executeSearchText,
  programmatic: true,
} satisfies FileToolDefinition<typeof searchTextSchema>;

const readFileSchema = z.strictObject({
  path: pathParam,
  offset,
  tail_lines: z
    .int({error: '必须是正整数。'})
    .min(1, {error: '必须是正整数。'})
    .max(FILE_LIMITS.maxTailLines)
    .optional()
    .describe(
      `读取末尾 N 行（1 到 ${FILE_LIMITS.maxTailLines}），优先于 offset；返回 start_line/end_line`,
    ),
});

async function executeReadFile(
  args: z.output<typeof readFileSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await readTextFile(args, workspace, signal))};
}

const readFileDefinition = {
  description: `按 UTF-16 字符偏移分页读取 UTF-8 文本，每页最多 ${FILE_LIMITS.textPageChars} 字符；也可用 tail_lines 读取末尾 N 行。`,
  parameters: readFileSchema,
  execute: executeReadFile,
  programmatic: true,
} satisfies FileToolDefinition<typeof readFileSchema>;

function writeMessage({path, changed}: {path: string; changed: boolean}) {
  return changed ? `已保存 ${path}` : `文件内容未发生变化：${path}`;
}

const writeFileSchema = z.strictObject({
  path: pathParam,
  content: stringParam,
  overwrite: z.boolean().default(false),
});

async function executeWriteFile(
  args: z.output<typeof writeFileSchema>,
  {workspace, signal, script}: FileToolContext,
): Promise<FileToolResult> {
  if (script && script.writeCount >= FILE_LIMITS.maxWritesPerScript) {
    throw new Error(
      `每次脚本执行最多保存 ${FILE_LIMITS.maxWritesPerScript} 个文件。`,
    );
  }
  const written = await writeTextFile(args, workspace, signal);
  if (script) {
    script.writeCount += 1;
    if (written.changed) {
      script.savedPaths.push(written.path);
    }
    return {text: JSON.stringify({path: written.path})};
  }
  return {text: writeMessage(written)};
}

const writeFileDefinition = {
  description:
    '在 workspace/ 创建 UTF-8 文本文件。覆盖已有文件需设置 overwrite。',
  parameters: writeFileSchema,
  execute: executeWriteFile,
  programmatic: true,
  inputLimit: WRITE_TOOL_INPUT_LIMIT,
} satisfies FileToolDefinition<typeof writeFileSchema>;

const editFileSchema = z.strictObject({
  path: pathParam,
  old_text: stringParam.min(1, '不能为空。'),
  new_text: stringParam,
  all: z.boolean().default(false),
});

async function executeEditFile(
  args: z.output<typeof editFileSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {
    text: JSON.stringify(await editTextFile(args, workspace, signal)),
  };
}

const editFileDefinition = {
  description:
    '在 workspace/ 的 UTF-8 文本文件中替换 old_text，返回 {path, changed, replaced}。默认要求唯一匹配；all: true 替换全部。',
  parameters: editFileSchema,
  execute: executeEditFile,
} satisfies FileToolDefinition<typeof editFileSchema>;

const readImageSchema = z.strictObject({path: pathParam});

async function executeReadImage(
  args: z.output<typeof readImageSchema>,
  {workspace, signal, imageBudget}: FileToolContext,
): Promise<FileToolResult> {
  const image = await readImageFile(args, workspace, signal, imageBudget);
  return {
    text: `已读取图片 ${image.path}`,
    imageUrl: `data:${image.mime};base64,${image.content}`,
  };
}

const readImageDefinition = {
  description: '读取 PNG、JPEG、GIF 或 WebP 图片并交给视觉模型。',
  parameters: readImageSchema,
  execute: executeReadImage,
  requiresImages: true,
} satisfies FileToolDefinition<typeof readImageSchema>;

const codeExecSchema = z.strictObject({
  code: stringParam.min(1).max(JAVASCRIPT_LIMITS.maxCodeLength),
});

async function executeCode(
  {code}: z.output<typeof codeExecSchema>,
  {signal, runScript}: FileToolContext,
): Promise<FileToolResult> {
  return {text: await runScript(code, signal)};
}

const codeExecDefinition = {
  description:
    '在独立 JavaScript 环境中编排本地文件工具并处理数据。使用 await tools.call(name, args) 调用工具，用 return 返回最终结果。',
  parameters: codeExecSchema,
  execute: executeCode,
} satisfies FileToolDefinition<typeof codeExecSchema>;

export const fileToolDefinitions = {
  list_dir: listDirectoryDefinition,
  find_files: findFilesDefinition,
  search_text: searchTextDefinition,
  read_file: readFileDefinition,
  write_file: writeFileDefinition,
  edit_file: editFileDefinition,
  read_image: readImageDefinition,
  delete_path: deletePathDefinition,
  move_path: movePathDefinition,
  code_exec: codeExecDefinition,
} satisfies Record<string, FileToolDefinition>;
