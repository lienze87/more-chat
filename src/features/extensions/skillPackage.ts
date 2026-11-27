import {fromByteArray} from 'base64-js';
import {strToU8, unzipSync} from 'fflate';
import {parse, stringify} from 'yaml';
import {SKILL_LIMITS} from '../../config/appConfig';
import {imageMimeType, isTextPath, relativePath} from './filePaths';

export interface SkillPackage {
  name: string;
  description: string;
  enabled: boolean;
  files: Record<string, string>;
}

export const isSkillPathVisible = (path: string): boolean =>
  path.split('/').every(part => !part.startsWith('.') && part !== '__MACOSX');

export const isSkillFile = (path: string): boolean =>
  isTextPath(path) || imageMimeType(path) !== undefined;

function readUtf8(bytes: Uint8Array, path: string): string {
  try {
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    if (!text.includes('\0')) {
      return text;
    }
  } catch {
    // 解码失败时显示包含文件路径的错误。
  }
  throw new Error(`需要 UTF-8 文本：${path}`);
}

function unpack(name: string, bytes: Uint8Array): [string, Uint8Array][] {
  if (name === 'SKILL.md') {
    return [['SKILL.md', bytes]];
  }
  if (!name.toLowerCase().endsWith('.zip')) {
    throw new Error('请选择 SKILL.md 或包含该文件的 ZIP。');
  }

  let total = 0;
  const names = new Set<string>();
  return Object.entries(
    unzipSync(bytes, {
      filter: entry => {
        const path = entry.name.replace(/\/$/, '');
        relativePath(path);
        if (
          !isSkillPathVisible(path) ||
          !isSkillFile(path) ||
          entry.name.endsWith('/')
        ) {
          return false;
        }
        if (names.has(path)) {
          throw new Error(`Skill 包含重复的文件：${path}`);
        }
        names.add(path);
        const size = entry.compression === 0 ? entry.size : entry.originalSize;
        total += size;
        if (
          names.size > SKILL_LIMITS.maxPackageFiles ||
          total > SKILL_LIMITS.maxPackageBytes ||
          size > SKILL_LIMITS.maxFileBytes
        ) {
          throw new Error('Skill 包解压后超过大小或文件数限制。');
        }
        return true;
      },
    }),
  );
}

export function parseSkillPackage(
  name: string,
  bytes: Uint8Array,
): SkillPackage {
  return parseSkillFiles(unpack(name, bytes));
}

export function createSkillPackage(
  name: string,
  description: string,
  body: string,
): SkillPackage {
  const metadata = stringify(
    {name: name.trim(), description: description.trim()},
    {lineWidth: 0},
  );
  return parseSkillPackage('SKILL.md', strToU8(`---\n${metadata}---\n${body}`));
}

export function parseSkillFiles(entries: [string, Uint8Array][]): SkillPackage {
  const manifests = entries.filter(
    ([path]) => path.split('/').at(-1) === 'SKILL.md',
  );
  if (manifests.length !== 1) {
    throw new Error('每次导入需要且只允许一个 SKILL.md。');
  }

  const [manifestPath, manifest] = manifests[0];
  const maxFileMb = SKILL_LIMITS.maxFileBytes / (1024 * 1024);
  if (manifest.length > SKILL_LIMITS.maxFileBytes) {
    throw new Error(`SKILL.md 不能超过 ${maxFileMb} MB。`);
  }
  const raw = readUtf8(manifest, manifestPath)
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n');
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(raw);
  if (!frontmatter) {
    throw new Error('SKILL.md 缺少 YAML frontmatter。');
  }
  const metadata = parse(frontmatter[1], {maxAliasCount: 0});
  const skillName = metadata?.name;
  const description = metadata?.description;
  if (
    typeof skillName !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName) ||
    skillName.length > SKILL_LIMITS.maxNameLength
  ) {
    throw new Error(
      `Skill 名称须为 1–${SKILL_LIMITS.maxNameLength} 位小写字母、数字或连字符。`,
    );
  }
  if (
    typeof description !== 'string' ||
    !description.trim() ||
    description.length > SKILL_LIMITS.maxDescriptionLength ||
    !raw.slice(frontmatter[0].length).trim()
  ) {
    throw new Error('SKILL.md 需要有效的 description 和正文。');
  }

  const prefix = manifestPath.slice(0, -'SKILL.md'.length);
  const files: Record<string, string> = Object.create(null);
  for (const [path, contents] of entries) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    const relative = path.slice(prefix.length);
    relativePath(`skills/${skillName}/${relative}`);
    if (contents.length > SKILL_LIMITS.maxFileBytes) {
      throw new Error(`文件超过 ${maxFileMb} MB：${relative}`);
    }
    if (imageMimeType(relative)) {
      files[relative] = fromByteArray(contents);
    } else {
      files[relative] = readUtf8(contents, relative);
    }
  }
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    if (
      parts.some(
        (_, index) =>
          index > 0 && Object.hasOwn(files, parts.slice(0, index).join('/')),
      )
    ) {
      throw new Error(`Skill 文件与目录重名：${path}`);
    }
  }
  return {
    name: skillName,
    description: description.trim(),
    enabled: true,
    files,
  };
}
