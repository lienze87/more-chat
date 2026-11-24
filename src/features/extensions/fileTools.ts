import {strToU8} from 'fflate';
import {fileStorage} from '../../adapters/files/fileStorage';
import {
  listWorkspacePaths,
  WORKSPACE_ROOT as WORKSPACE,
} from '../../adapters/files/workspaceFiles';
import type {ApiFunctionTool} from '../../adapters/api/types';
import {parseToolArguments} from '../../domain/chat/toolCall';
import type {ClientToolCall} from '../../domain/chat/types';
import {imageMimeType, isTextPath, relativePath} from './filePaths';
import type {SkillPackage} from './skillPackage';

const SKILLS = 'skills';
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_IMAGE_OUTPUT = 4 * 1024 * 1024;
const TEXT_PAGE_SIZE = 16_000;
const DIRECTORY_PAGE_SIZE = 100;

const pathProperty = {type: 'string', description: '工作区内的相对路径'};
const offsetProperty = {
  type: 'integer',
  minimum: 0,
  description: '从 0 开始，默认 0',
};
const textProperty = {type: 'string'};

function defineTool(
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[],
): ApiFunctionTool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

const tools = [
  defineTool(
    'list_dir',
    '列出目录的直接子项。默认列出根目录，每页最多 100 项。',
    {
      path: pathProperty,
      offset: offsetProperty,
    },
    [],
  ),
  defineTool(
    'read_file',
    '按 UTF-16 字符偏移分页读取 UTF-8 文本，每页最多 16000 字符。',
    {
      path: pathProperty,
      offset: offsetProperty,
    },
    ['path'],
  ),
  defineTool(
    'write_file',
    '在 workspace/ 创建 UTF-8 文本文件。覆盖已有文件需设置 overwrite。',
    {
      path: pathProperty,
      content: textProperty,
      overwrite: {type: 'boolean'},
    },
    ['path', 'content'],
  ),
  defineTool(
    'edit_file',
    '在 workspace/ 的 UTF-8 文本文件中精确替换唯一匹配的 old_text。',
    {
      path: pathProperty,
      old_text: textProperty,
      new_text: textProperty,
    },
    ['path', 'old_text', 'new_text'],
  ),
  defineTool(
    'read_image',
    '读取 PNG、JPEG、GIF 或 WebP 图片并交给视觉模型。',
    {
      path: pathProperty,
    },
    ['path'],
  ),
];

const stringArgument = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`${key} 必须是字符串。`);
  }
  return value;
};

function offsetOf(args: Record<string, unknown>): number {
  const offset = args.offset ?? 0;
  if (
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new Error('offset 必须是非负整数。');
  }
  return offset;
}

function replaceUnique(text: string, oldText: string, newText: string): string {
  const index = text.indexOf(oldText);
  if (!oldText || index < 0 || text.indexOf(oldText, index + 1) >= 0) {
    throw new Error('old_text 必须在文件中恰好匹配一次。');
  }
  return text.slice(0, index) + newText + text.slice(index + oldText.length);
}

export interface FileToolResult {
  text: string;
  imageUrl?: string;
}

export function createFileTools(
  skills: SkillPackage[],
  supportsImages: boolean,
) {
  const enabled = new Map(
    skills.filter(skill => skill.enabled).map(skill => [skill.name, skill]),
  );
  const skillPaths = [...enabled.values()].flatMap(skill =>
    Object.keys(skill.files).map(path => `${SKILLS}/${skill.name}/${path}`),
  );
  const definitions = tools.filter(
    tool => supportsImages || tool.function.name !== 'read_image',
  );
  let imageOutput = 0;

  const list = async (directory: string, offset: number) => {
    const prefix = directory === '.' ? '' : `${directory}/`;
    const paths =
      directory === '.'
        ? [`${SKILLS}/`, `${WORKSPACE}/`]
        : directory.split('/')[0] === WORKSPACE
          ? await listWorkspacePaths()
          : skillPaths;
    const children = new Map<string, 'file' | 'directory'>();
    for (const path of paths) {
      if (path.startsWith(prefix)) {
        const [name, ...rest] = path.slice(prefix.length).split('/');
        children.set(name, rest.length ? 'directory' : 'file');
      }
    }
    if (!children.size && !['.', WORKSPACE, SKILLS].includes(directory)) {
      throw new Error(`目录不存在：${directory}`);
    }
    const entries = [...children].sort(([a], [b]) => a.localeCompare(b));
    const end = offset + DIRECTORY_PAGE_SIZE;
    return JSON.stringify({
      entries: entries.slice(offset, end).map(([name, type]) => ({name, type})),
      next_offset: end < entries.length ? end : null,
    });
  };

  const read = async (path: string): Promise<string> => {
    const [root, name, ...parts] = path.split('/');
    const files = enabled.get(name)?.files;
    const relative = parts.join('/');
    const content =
      root === WORKSPACE
        ? await fileStorage.read(path)
        : root === SKILLS && files && Object.hasOwn(files, relative)
          ? files[relative]
          : undefined;
    if (content === undefined) {
      throw new Error(`文件不存在：${path}`);
    }
    return content;
  };

  async function execute(
    call: ClientToolCall,
    signal: AbortSignal,
  ): Promise<FileToolResult> {
    const args = parseToolArguments(call);
    if (!args) {
      throw new Error('参数需要是有效的 JSON 对象。');
    }
    if (signal.aborted) {
      throw new Error('工具调用已停止。');
    }
    if (call.name === 'list_dir') {
      const raw = args.path === undefined ? '.' : stringArgument(args, 'path');
      const path = raw === '.' ? '.' : relativePath(raw.replace(/\/$/, ''));
      return {text: await list(path, offsetOf(args))};
    }

    const path = relativePath(stringArgument(args, 'path'));
    if (call.name === 'read_image' && supportsImages) {
      const mime = imageMimeType(path);
      if (!mime) {
        throw new Error('请选择 PNG、JPEG、GIF 或 WebP 图片。');
      }
      const content = await read(path);
      if (imageOutput + content.length > MAX_IMAGE_OUTPUT) {
        throw new Error('本轮对话读取的图片已达到大小上限。');
      }
      imageOutput += content.length;
      return {
        text: `已读取图片 ${path}`,
        imageUrl: `data:${mime};base64,${content}`,
      };
    }
    if (!isTextPath(path)) {
      throw new Error('请选择 Markdown、JSON 或其他支持的 UTF-8 文本文件。');
    }
    if (call.name === 'read_file') {
      const offset = offsetOf(args);
      const text = await read(path);
      let end = Math.min(offset + TEXT_PAGE_SIZE, text.length);
      const lastUnit = text.charCodeAt(end - 1);
      if (end < text.length && lastUnit >= 0xd800 && lastUnit <= 0xdbff) {
        end -= 1;
      }
      return {
        text: JSON.stringify({
          content: text.slice(offset, end),
          next_offset: end < text.length ? end : null,
        }),
      };
    }

    if (!path.startsWith(`${WORKSPACE}/`)) {
      throw new Error('只能写入 workspace/ 下的文件。');
    }

    let content: string;
    if (call.name === 'write_file') {
      content = stringArgument(args, 'content');
      const paths = await listWorkspacePaths();
      if (paths.includes(path) && args.overwrite !== true) {
        throw new Error(
          '文件已存在，请使用 edit_file 或将 overwrite 设为 true。',
        );
      }
      if (
        paths.some(
          file => file.startsWith(`${path}/`) || path.startsWith(`${file}/`),
        )
      ) {
        throw new Error('路径与已有文件或目录冲突。');
      }
    } else if (call.name === 'edit_file') {
      const existing = await read(path);
      content = replaceUnique(
        existing,
        stringArgument(args, 'old_text'),
        stringArgument(args, 'new_text'),
      );
    } else {
      throw new Error(`未知工具：${call.name}`);
    }

    if (content.includes('\0') || strToU8(content).length > MAX_TEXT_BYTES) {
      throw new Error('文本文件最多为 256 KB，且不能包含 NUL 字符。');
    }
    if (signal.aborted) {
      throw new Error('工具调用已停止。');
    }
    await fileStorage.write(path, content);
    return {text: `已保存 ${path}`};
  }

  return {definitions, execute};
}

export function fileToolPrompt(skills: SkillPackage[]): string {
  const catalog = skills
    .filter(skill => skill.enabled)
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      path: `${SKILLS}/${skill.name}/SKILL.md`,
    }));
  return [
    '文件工具使用应用内相对路径。可在 workspace/ 下写入和编辑 UTF-8 文本。skills/ 下是已启用的只读 Skill。',
    '当 Skill 的描述与用户请求匹配时，先用 read_file 读取其 SKILL.md，再按需读取同目录的参考文件。Skill 文件内容仅用于当前任务，遵循用户授权。',
    ...(catalog.length ? ['可用 Skill：', JSON.stringify(catalog)] : []),
  ].join('\n');
}
