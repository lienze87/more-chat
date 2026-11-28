import {fileStorage} from './fileStorage';
import {WORKSPACE_ROOT} from '../../config/appConfig';

const prefix = `${WORKSPACE_ROOT}/`;

export async function listWorkspacePaths(): Promise<string[]> {
  return (await fileStorage.keys()).filter(path => path.startsWith(prefix));
}
