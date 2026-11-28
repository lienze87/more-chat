import {fileStorage} from '../../adapters/files/fileStorage';
import {WORKSPACE_ROOT} from '../../config/appConfig';
import {skillPathParts} from './filePaths';
import type {SkillPackage} from '../../domain/skills/types';

/**
 * Skill 文件访问级别。
 *
 * - `enabled`：模型工具只能读取已启用的 Skill；
 * - `all`：用户主动打开的文件预览可以读取任意已安装的 Skill。
 */
export type SkillAccess = 'enabled' | 'all';

export interface AppFileOptions {
  skillAccess: SkillAccess;
}

/** 从已安装的 Skill 中读取一个包内文件；路径不属于 Skill 时返回 undefined。 */
export function readSkillFile(
  path: string,
  skills: readonly SkillPackage[],
  skillAccess: SkillAccess,
): string | undefined {
  const target = skillPathParts(path);
  if (!target) {
    return undefined;
  }
  const skill = skills.find(item => item.name === target.name);
  if (!skill || (skillAccess === 'enabled' && !skill.enabled)) {
    return undefined;
  }
  return Object.hasOwn(skill.files, target.relative)
    ? skill.files[target.relative]
    : undefined;
}

/**
 * 读取应用内文件：`workspace/` 走文件存储，`skills/` 走 Skill 包。
 *
 * 工具层与文件预览共用这一入口，避免两处各写一套 Skill 路径解析。
 */
export async function readAppFile(
  path: string,
  skills: readonly SkillPackage[],
  {skillAccess}: AppFileOptions,
): Promise<string | undefined> {
  if (path.startsWith(`${WORKSPACE_ROOT}/`)) {
    return fileStorage.read(path);
  }
  return readSkillFile(path, skills, skillAccess);
}
