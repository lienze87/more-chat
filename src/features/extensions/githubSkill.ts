import {SKILL_LIMITS} from '../../config/appConfig';
import {relativePath} from './filePaths';
import {isSkillFile, isSkillPathVisible, parseSkillFiles} from './skillPackage';

const RAW_ORIGIN = 'https://raw.githubusercontent.com';
const URL_ERROR =
  '请输入公开 GitHub 仓库、Skill 目录或 SKILL.md 的 HTTPS 链接。';
const PACKAGE_LIMIT = 'Skill 超过文件大小或数量限制。';

interface GitHubEntry {
  name: string;
  type: string;
  size: number;
  download_url: string | null;
  submodule_git_url?: string;
}

function parseGitHubUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const segments = url.pathname.split('/').slice(1).map(decodeURIComponent);
    if (segments.at(-1) === '') {
      segments.pop();
    }
    const [owner, repository, ...route] = segments;
    if (
      url.username ||
      url.password ||
      !/^[\w-]+$/.test(owner ?? '') ||
      !/^[\w.-]+$/.test(repository ?? '') ||
      repository === '.' ||
      repository === '..'
    ) {
      throw new Error();
    }
    const repo = repository.replace(/\.git$/, '');
    const api = `https://api.github.com/repos/${owner}/${repo}/contents`;
    if (url.origin === 'https://github.com' && route.length === 0) {
      return {api, refAndPath: []};
    }
    if (
      url.origin === 'https://github.com' &&
      route[0] === 'tree' &&
      route.length >= 2
    ) {
      return {api, refAndPath: route.slice(1)};
    }
    const target =
      url.origin === RAW_ORIGIN
        ? route
        : url.origin === 'https://github.com' && route[0] === 'blob'
          ? route.slice(1)
          : [];
    if (target.length >= 2 && target.at(-1) === 'SKILL.md') {
      return {api, refAndPath: target.slice(0, -1)};
    }
  } catch {
    throw new Error(URL_ERROR);
  }
  throw new Error(URL_ERROR);
}

async function listDirectory(
  api: string,
  path: string[],
  ref: string | undefined,
  signal: AbortSignal,
) {
  const suffix = path.length
    ? `/${path.map(encodeURIComponent).join('/')}`
    : '';
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const response = await fetch(`${api}${suffix}${query}`, {
    signal,
    credentials: 'omit',
  });
  if (response.status === 404) {
    return undefined;
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub 请求受限，请稍后重试。');
  }
  if (!response.ok) {
    throw new Error(`无法读取 GitHub 目录（HTTP ${response.status}）。`);
  }
  const entries: unknown = await response.json();
  if (
    Array.isArray(entries) &&
    entries.length >= SKILL_LIMITS.githubMaxDirectoryEntries
  ) {
    throw new Error('GitHub 目录文件过多，请缩小 Skill 目录。');
  }
  return Array.isArray(entries) ? (entries as GitHubEntry[]) : undefined;
}

async function findSkillDirectory(
  api: string,
  refAndPath: string[],
  signal: AbortSignal,
) {
  // GitHub 的 /tree 和 /blob URL 中，带斜杠的分支名与目录共用路径。
  const firstRefLength = refAndPath.length ? 1 : 0;
  for (let length = firstRefLength; length <= refAndPath.length; length++) {
    const ref = refAndPath.slice(0, length).join('/') || undefined;
    const path = refAndPath.slice(length);
    if (
      path.some(
        part =>
          !part ||
          part === '.' ||
          part === '..' ||
          part.includes('/') ||
          part.includes('\\'),
      )
    ) {
      continue;
    }
    const entries = await listDirectory(api, path, ref, signal);
    if (
      entries?.some(entry => entry.name === 'SKILL.md' && entry.type === 'file')
    ) {
      return {ref, path, entries};
    }
  }
  throw new Error(
    '找不到 SKILL.md。请检查仓库是否公开，并使用包含 SKILL.md 的目录或文件链接。',
  );
}

async function downloadSkill(
  api: string,
  refAndPath: string[],
  signal: AbortSignal,
) {
  const {ref, path, entries} = await findSkillDirectory(
    api,
    refAndPath,
    signal,
  );
  const directories = [{parts: [] as string[], entries}];
  const files: {path: string; url: string}[] = [];
  let total = 0;

  for (const directory of directories) {
    for (const entry of directory.entries) {
      const parts = [...directory.parts, entry.name];
      const filePath = parts.join('/');
      if (!isSkillPathVisible(filePath)) {
        continue;
      }
      if (entry.type === 'dir') {
        relativePath(filePath);
        if (directories.length >= SKILL_LIMITS.maxPackageFiles) {
          throw new Error(PACKAGE_LIMIT);
        }
        const children = await listDirectory(
          api,
          [...path, ...parts],
          ref,
          signal,
        );
        if (!children) {
          throw new Error(`无法读取 GitHub 目录：${filePath}`);
        }
        directories.push({parts, entries: children});
      } else if (
        entry.type === 'file' &&
        !entry.submodule_git_url &&
        isSkillFile(filePath)
      ) {
        relativePath(filePath);
        if (
          !entry.download_url ||
          new URL(entry.download_url).origin !== RAW_ORIGIN
        ) {
          throw new Error(`无法下载 GitHub 文件：${filePath}`);
        }
        total += entry.size;
        if (
          entry.size > SKILL_LIMITS.maxFileBytes ||
          total > SKILL_LIMITS.maxPackageBytes ||
          files.length >= SKILL_LIMITS.maxPackageFiles
        ) {
          throw new Error(PACKAGE_LIMIT);
        }
        files.push({path: filePath, url: entry.download_url});
      }
    }
  }

  const downloaded: [string, Uint8Array][] = [];
  let downloadedBytes = 0;
  for (
    let index = 0;
    index < files.length;
    index += SKILL_LIMITS.githubDownloadBatchSize
  ) {
    const batch = await Promise.all(
      files
        .slice(index, index + SKILL_LIMITS.githubDownloadBatchSize)
        .map(async (file): Promise<[string, Uint8Array]> => {
          const response = await fetch(file.url, {signal, credentials: 'omit'});
          if (!response.ok) {
            throw new Error(`无法下载 GitHub 文件：${file.path}`);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          downloadedBytes += bytes.length;
          if (
            bytes.length > SKILL_LIMITS.maxFileBytes ||
            downloadedBytes > SKILL_LIMITS.maxPackageBytes
          ) {
            throw new Error(PACKAGE_LIMIT);
          }
          return [file.path, bytes];
        }),
    );
    downloaded.push(...batch);
  }
  return parseSkillFiles(downloaded);
}

export async function importGitHubSkill(value: string) {
  const {api, refAndPath} = parseGitHubUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SKILL_LIMITS.githubImportTimeoutMs,
  );
  try {
    return await downloadSkill(api, refAndPath, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('读取 GitHub 超时，请重试。', {cause: error});
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
