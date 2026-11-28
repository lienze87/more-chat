import {toByteArray} from 'base64-js';
import {strToU8} from 'fflate';
import {z} from 'zod';
import type {ApiFunctionTool} from '../../adapters/api/types';
import {fileStorage} from '../../adapters/files/fileStorage';
import {listWorkspacePaths} from '../../adapters/files/workspaceFiles';
import {runJavaScript} from '../../adapters/js/runJavaScript';
import {FILE_LIMITS, SKILLS_ROOT, WORKSPACE_ROOT} from '../../config/appConfig';
import {parseToolArguments} from '../../domain/chat/toolCall';
import type {ClientToolCall} from '../../domain/chat/types';
import type {FileToolWorkspace} from './fileOperations';
import {imageMimeType} from './filePaths';
import {readAppFile} from './appFiles';
import {FileToolError} from './fileToolError';
import type {SkillPackage} from './skillPackage';
import {
  clientToolDefinitions,
  type ClientToolContext,
  type ClientToolDefinition,
} from './toolDefinitions';

type ToolCallInput = Pick<ClientToolCall, 'id' | 'name' | 'argumentsText'>;

function registerTool(name: string, tool: ClientToolDefinition) {
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
    programmatic: tool.programmatic,
    inputLimit: tool.inputLimit,
    async execute(input: unknown, context: ClientToolContext) {
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

export function createClientTools(
  skills: SkillPackage[],
  supportsImages: boolean,
) {
  const enabledSkills = skills.filter(skill => skill.enabled);
  async function readPath(path: string) {
    return readAppFile(path, skills, {skillAccess: 'enabled'});
  }
  const workspace: FileToolWorkspace = {
    listWorkspacePaths,
    skillPaths: enabledSkills.flatMap(skill =>
      Object.keys(skill.files).map(
        path => `${SKILLS_ROOT}/${skill.name}/${path}`,
      ),
    ),
    read: readPath,
    write: (path, content) => fileStorage.write(path, content),
    remove: path => fileStorage.remove(path),
    rename: (from, to, overwrite) => fileStorage.rename(from, to, overwrite),
    async stat(path) {
      if (path.startsWith(`${WORKSPACE_ROOT}/`)) {
        return fileStorage.stat(path);
      }
      const content = await readPath(path);
      if (content === undefined) {
        return undefined;
      }
      return {
        size: imageMimeType(path)
          ? toByteArray(content).length
          : strToU8(content).length,
      };
    },
  };
  const imageBudget = {remainingChars: FILE_LIMITS.maxImageOutputCharsPerRun};
  const available = new Map<string, ReturnType<typeof registerTool>>();
  for (const [name, tool] of Object.entries<ClientToolDefinition>(
    clientToolDefinitions,
  )) {
    if (!tool.requiresImages || supportsImages) {
      available.set(name, registerTool(name, tool));
    }
  }
  const scriptTools = [...available].filter(([, tool]) => tool.programmatic);
  const scriptNames = scriptTools.map(([name]) => name);
  const scriptInputLimits = Object.fromEntries(
    scriptTools.flatMap(([name, {inputLimit}]) =>
      inputLimit === undefined ? [] : [[name, inputLimit] as const],
    ),
  );

  async function invoke(
    call: ToolCallInput,
    signal: AbortSignal,
    script?: ClientToolContext['script'],
  ) {
    const tool = available.get(call.name);
    if (script && !tool?.programmatic) {
      throw new Error(`脚本可调用的工具为 ${scriptNames.join('、')}。`);
    }
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
      callId: call.id,
      workspace,
      script,
      imageBudget,
      runScript,
    });
  }

  async function runScript(code: string, signal: AbortSignal): Promise<string> {
    const savedPaths: string[] = [];
    const script = {writeCount: 0, writeBytes: 0, savedPaths};
    try {
      return await runJavaScript(
        code,
        async (name, argumentsText, scriptSignal) => {
          const result = await invoke(
            {id: '', name, argumentsText},
            scriptSignal,
            script,
          );
          return result.text;
        },
        signal,
        scriptInputLimits,
      );
    } catch (error) {
      if (!savedPaths.length) {
        throw error;
      }
      const message = error instanceof Error ? error.message : '脚本执行失败。';
      throw new FileToolError(
        `${message} 已保存的文件：${savedPaths.join('、')}`,
        {cause: error, savedPaths},
      );
    }
  }

  return {
    definitions: [...available.values()].map(tool => tool.definition),
    prompt: clientToolPrompt(enabledSkills, scriptNames),
    has: (name: string) => available.has(name),
    execute: (call: ToolCallInput, signal: AbortSignal) => invoke(call, signal),
  };
}

export type ClientToolSnapshot = ReturnType<typeof createClientTools>;

function clientToolPrompt(
  skills: SkillPackage[],
  scriptNames: string[],
): string {
  const catalog = skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    path: `${SKILLS_ROOT}/${skill.name}/SKILL.md`,
  }));
  return [
    '文件工具使用完整的应用内路径，例如 workspace/notes.md 或 skills/名称/SKILL.md。列出或搜索目录时可用 . 表示应用内根目录。写入、编辑、移动和删除限于 workspace/。skills/ 下只可读取已启用的 Skill。删除目录需设置 recursive: true。',
    '回答中引用本地文件时，使用 `workspace/路径` 或 `skills/名称/路径` 的行内代码格式，界面会把它变成可点击的文件入口；只引用真实存在的路径。',
    '当关键选择会实质改变结果、需要用户拍板时，先调用 ask_user 提出一个问题并提供 2–4 个选项；用户可以直接选择、多选或输入自定义回答。不要在可以合理推断或只需告知的事情上打断用户。',
    '当 Skill 的描述与用户请求匹配时，先用 read_file 读取其 SKILL.md，再按需读取同目录的参考文件。Skill 文件内容仅用于当前任务，遵循用户授权。',
    `需要批量查找、读取、筛选或汇总本地文本时，优先调用 code_exec。参数 code 是异步 JavaScript 函数体，通过 await tools.call(name, args) 使用同名客户端工具的参数。可用工具为 ${scriptNames.join('、')}，结果为 JSON。分页字段 next_offset 或 next_cursor 为 null 时结束。`,
    `每次 code_exec 可用 write_file 保存最多 ${FILE_LIMITS.maxWritesPerScript} 个 workspace/ 文本文件、合计 ${FILE_LIMITS.maxWriteBytesPerScript / 1024} KB，每次调用返回 {path}。只在任务需要保存文件时调用；覆盖需明确设置 overwrite。用 return 只返回回答所需的摘要或文件路径。`,
    ...(catalog.length ? ['可用 Skill：', JSON.stringify(catalog)] : []),
  ].join('\n');
}
