import {z} from 'zod';
import {
  FILE_LIMITS,
  FILE_SEARCH_LIMITS,
  WRITE_TOOL_INPUT_LIMIT,
} from '../../../config/appConfig';
import {
  editTextFile,
  findFiles,
  listDirectory,
  readImageFile,
  readTextFile,
  searchText,
  writeTextFile,
  type FileToolWorkspace,
} from '../fileOperations';

export interface FileToolContext {
  signal: AbortSignal;
  workspace: FileToolWorkspace;
  imageBudget: {remainingChars: number};
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
  description: `列出目录的直接子项。默认列出根目录，每页最多 ${FILE_LIMITS.directoryPageItems} 项。`,
  parameters: listDirectorySchema,
  execute: executeListDirectory,
} satisfies FileToolDefinition<typeof listDirectorySchema>;

const findFilesSchema = z.strictObject({path: directory, pattern, offset});

async function executeFindFiles(
  args: z.output<typeof findFilesSchema>,
  {workspace}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await findFiles(args, workspace))};
}

const findFilesDefinition = {
  description: `递归查找匹配路径模式的本地文件，返回 {paths, next_offset}，每页最多 ${FILE_LIMITS.directoryPageItems} 项。path 默认是应用内根目录。`,
  parameters: findFilesSchema,
  execute: executeFindFiles,
} satisfies FileToolDefinition<typeof findFilesSchema>;

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
    '递归搜索 UTF-8 文本文件中的区分大小写的字面量。返回 {matches: [{path, line, text}], next_cursor}。即使本页没有命中，只要 next_cursor 非 null 就可继续。',
  parameters: searchTextSchema,
  execute: executeSearchText,
} satisfies FileToolDefinition<typeof searchTextSchema>;

const readFileSchema = z.strictObject({path: pathParam, offset});

async function executeReadFile(
  args: z.output<typeof readFileSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: JSON.stringify(await readTextFile(args, workspace, signal))};
}

const readFileDefinition = {
  description: `按 UTF-16 字符偏移分页读取 UTF-8 文本，每页最多 ${FILE_LIMITS.textPageChars} 字符。`,
  parameters: readFileSchema,
  execute: executeReadFile,
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
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: writeMessage(await writeTextFile(args, workspace, signal))};
}

const writeFileDefinition = {
  description:
    '在 workspace/ 创建 UTF-8 文本文件。覆盖已有文件需设置 overwrite。',
  parameters: writeFileSchema,
  execute: executeWriteFile,
  inputLimit: WRITE_TOOL_INPUT_LIMIT,
} satisfies FileToolDefinition<typeof writeFileSchema>;

const editFileSchema = z.strictObject({
  path: pathParam,
  old_text: stringParam.min(1, '不能为空。'),
  new_text: stringParam,
});

async function executeEditFile(
  args: z.output<typeof editFileSchema>,
  {workspace, signal}: FileToolContext,
): Promise<FileToolResult> {
  return {text: writeMessage(await editTextFile(args, workspace, signal))};
}

const editFileDefinition = {
  description: '在 workspace/ 的 UTF-8 文本文件中精确替换唯一匹配的 old_text。',
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

export const fileToolDefinitions = {
  list_dir: listDirectoryDefinition,
  find_files: findFilesDefinition,
  search_text: searchTextDefinition,
  read_file: readFileDefinition,
  write_file: writeFileDefinition,
  edit_file: editFileDefinition,
  read_image: readImageDefinition,
} satisfies Record<string, FileToolDefinition>;
