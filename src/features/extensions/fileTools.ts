import {z} from 'zod';
import type {ApiFunctionTool} from '../../adapters/api/types';
import {fileStorage} from '../../adapters/files/fileStorage';
import {listWorkspacePaths} from '../../adapters/files/workspaceFiles';
import {FILE_LIMITS, WORKSPACE_ROOT} from '../../config/appConfig';
import {parseToolArguments} from '../../domain/chat/toolCall';
import type {ClientToolCall} from '../../domain/chat/types';
import {SKILLS_ROOT, type FileToolWorkspace} from './fileOperations';
import type {SkillPackage} from './skillPackage';
import {
  fileToolDefinitions,
  type FileToolContext,
  type FileToolDefinition,
} from './tools';

type ToolCallInput = Pick<ClientToolCall, 'name' | 'argumentsText'>;

function registerTool(name: string, tool: FileToolDefinition) {
  const parameters = z.toJSONSchema(tool.parameters, {
    io: 'input',
    target: 'draft-07',
  });
  delete parameters.$schema;
  const definition: ApiFunctionTool = {
    type: 'function',
    function: {name, description: tool.description, parameters},
  };

  return {
    definition,
    inputLimit: tool.inputLimit,
    async execute(input: unknown, context: FileToolContext) {
      const parsed = tool.parameters.safeParse(input, {
        error: issue =>
          issue.code === 'unrecognized_keys' ? '包含未声明的参数。' : undefined,
      });
      if (!parsed.success) {
        const details = parsed.error.issues.map(issue =>
          issue.path.length
            ? `${issue.path.join('.')} ${issue.message}`
            : issue.message,
        );
        throw new Error(`工具参数无效：${details.join(' ')}`);
      }
      return tool.execute(parsed.data, context);
    },
  };
}

export function createFileTools(
  skills: SkillPackage[],
  supportsImages: boolean,
) {
  const enabled = new Map(
    skills.filter(skill => skill.enabled).map(skill => [skill.name, skill]),
  );
  const workspace: FileToolWorkspace = {
    listWorkspacePaths,
    skillPaths: [...enabled.values()].flatMap(skill =>
      Object.keys(skill.files).map(
        path => `${SKILLS_ROOT}/${skill.name}/${path}`,
      ),
    ),
    async read(path) {
      const [root, name, ...parts] = path.split('/');
      if (root === WORKSPACE_ROOT) {
        return fileStorage.read(path);
      }
      const files = root === SKILLS_ROOT ? enabled.get(name)?.files : undefined;
      const relative = parts.join('/');
      return files && Object.hasOwn(files, relative)
        ? files[relative]
        : undefined;
    },
    write: (path, content) => fileStorage.write(path, content),
  };
  const imageBudget = {remainingChars: FILE_LIMITS.maxImageOutputCharsPerRun};
  const available = new Map<string, ReturnType<typeof registerTool>>();
  for (const [name, tool] of Object.entries<FileToolDefinition>(
    fileToolDefinitions,
  )) {
    if (!tool.requiresImages || supportsImages) {
      available.set(name, registerTool(name, tool));
    }
  }
  async function invoke(call: ToolCallInput, signal: AbortSignal) {
    const tool = available.get(call.name);
    if (!tool) {
      throw new Error(`未知或不可用的客户端工具：${call.name}`);
    }
    if (signal.aborted) {
      throw new Error('工具调用已停止。');
    }
    if (
      tool.inputLimit !== undefined &&
      call.argumentsText.length > tool.inputLimit
    ) {
      throw new Error('工具参数无效：输入超过大小上限。');
    }
    const args = parseToolArguments(call);
    if (!args) {
      throw new Error('工具参数无效：参数需要是有效的 JSON 对象。');
    }
    return tool.execute(args, {
      signal,
      workspace,
      imageBudget,
    });
  }

  return {
    definitions: [...available.values()].map(tool => tool.definition),
    prompt: fileToolPrompt([...enabled.values()]),
    has: (name: string) => available.has(name),
    execute: (call: ToolCallInput, signal: AbortSignal) => invoke(call, signal),
  };
}

export type FileToolSnapshot = ReturnType<typeof createFileTools>;

function fileToolPrompt(skills: SkillPackage[]): string {
  const catalog = skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    path: `${SKILLS_ROOT}/${skill.name}/SKILL.md`,
  }));
  return [
    '文件工具使用应用内相对路径。可在 workspace/ 下写入和编辑 UTF-8 文本。skills/ 下是已启用的只读 Skill。',
    '当 Skill 的描述与用户请求匹配时，先用 read_file 读取其 SKILL.md，再按需读取同目录的参考文件。Skill 文件内容仅用于当前任务，遵循用户授权。',
    ...(catalog.length ? ['可用 Skill：', JSON.stringify(catalog)] : []),
  ].join('\n');
}
