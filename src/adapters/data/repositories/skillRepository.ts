import {fileStorage} from '../../files/fileStorage';
import type {SkillPackage} from '../../../domain/skills/types';

const SKILL_KEY_PREFIX = 'skill/';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function parseStoredSkill(raw: string): SkillPackage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const {name, description, enabled, files} = value;
  if (
    typeof name !== 'string' ||
    !name ||
    typeof description !== 'string' ||
    typeof enabled !== 'boolean' ||
    !isRecord(files)
  ) {
    return undefined;
  }
  const entries = Object.entries(files);
  if (!entries.every(([, content]) => typeof content === 'string')) {
    return undefined;
  }
  return {
    name,
    description,
    enabled,
    files: Object.fromEntries(entries) as Record<string, string>,
  };
}

/** Skill 的持久化入口：key 规则、结构校验和文件存储都收在这里。 */
export const skillRepository = {
  async load(): Promise<SkillPackage[]> {
    const keys = (await fileStorage.keys()).filter(key =>
      key.startsWith(SKILL_KEY_PREFIX),
    );
    const skills = await Promise.all(
      keys.map(async key => {
        const raw = await fileStorage.read(key);
        if (raw === undefined) {
          return undefined;
        }
        const skill = parseStoredSkill(raw);
        // key 与包内名称必须一致，避免损坏数据在重命名后留下孤儿记录。
        return skill?.name === key.slice(SKILL_KEY_PREFIX.length)
          ? skill
          : undefined;
      }),
    );
    return skills.filter((skill): skill is SkillPackage => skill !== undefined);
  },

  async save(skill: SkillPackage): Promise<void> {
    await fileStorage.write(
      `${SKILL_KEY_PREFIX}${skill.name}`,
      JSON.stringify(skill),
    );
  },

  async remove(name: string): Promise<void> {
    await fileStorage.remove(`${SKILL_KEY_PREFIX}${name}`);
  },
};
