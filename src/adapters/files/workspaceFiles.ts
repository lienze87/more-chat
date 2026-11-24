import {fileStorage} from './fileStorage';

export const WORKSPACE_ROOT = 'workspace';
const prefix = `${WORKSPACE_ROOT}/`;

export async function listWorkspacePaths(): Promise<string[]> {
  return (await fileStorage.keys()).filter(path => path.startsWith(prefix));
}

export async function readWorkspaceFile(
  path: string,
): Promise<string | undefined> {
  return path.startsWith(prefix) ? fileStorage.read(path) : undefined;
}
