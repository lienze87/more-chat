import {
  editTextFile,
  readImageFile,
  readTextFile,
  writeTextFile,
  type FileToolWorkspace,
} from '../src/features/extensions/fileOperations';
import {FileToolError} from '../src/features/extensions/fileToolError';

function createWorkspace(entries: Record<string, string> = {}) {
  const files = new Map(Object.entries(entries));
  const workspace = {
    listWorkspacePaths: async () => [...files.keys()],
    skillPaths: [],
    read: async (path: string) => files.get(path),
    write: jest.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
  } satisfies FileToolWorkspace;
  return {files, workspace};
}

const signal = new AbortController().signal;

it('rejects binary text, directory targets, and offsets outside a file', async () => {
  const {workspace} = createWorkspace({
    'workspace/binary.txt': 'a\0b',
    'workspace/dir.txt/item.md': '笔记',
  });
  await expect(
    readTextFile({path: 'workspace/binary.txt', offset: 0}, workspace, signal),
  ).rejects.toThrow('疑似二进制文件');
  await expect(
    readTextFile({path: 'workspace/dir.txt', offset: 0}, workspace, signal),
  ).rejects.toThrow('目标是目录');
  await expect(
    readTextFile(
      {path: 'workspace/dir.txt/item.md', offset: 3},
      workspace,
      signal,
    ),
  ).rejects.toThrow('offset 超出文件长度');
});

it('preserves CRLF and leaves the file untouched for a no-op or ambiguous edit', async () => {
  const path = 'workspace/notes.md';
  const {workspace, files} = createWorkspace({
    [path]: 'apple\r\npear\r\npear\r\n',
  });
  await expect(
    editTextFile(
      {path, old_text: 'apple\npear', new_text: 'apple\npear'},
      workspace,
      signal,
    ),
  ).resolves.toEqual({path, changed: false});
  await expect(
    editTextFile(
      {path, old_text: 'pear', new_text: 'peach'},
      workspace,
      signal,
    ),
  ).rejects.toThrow('匹配多处');
  expect(workspace.write).not.toHaveBeenCalled();
  await editTextFile(
    {path, old_text: 'apple\npear', new_text: 'plum\npeach'},
    workspace,
    signal,
  );
  expect(files.get(path)).toBe('plum\r\npeach\r\npear\r\n');
});

it('serializes checks and writes across competing path updates', async () => {
  const {workspace, files} = createWorkspace();
  const path = 'workspace/output.md';
  const [first, second, child] = await Promise.allSettled([
    writeTextFile(
      {path, content: 'first', overwrite: false},
      workspace,
      signal,
    ),
    writeTextFile(
      {path, content: 'second', overwrite: false},
      workspace,
      signal,
    ),
    writeTextFile(
      {path: `${path}/child.md`, content: 'child', overwrite: false},
      workspace,
      signal,
    ),
  ]);
  expect(first).toEqual({status: 'fulfilled', value: {path, changed: true}});
  expect(second).toMatchObject({
    status: 'rejected',
    reason: expect.any(FileToolError),
  });
  expect(child).toMatchObject({
    status: 'rejected',
    reason: expect.any(FileToolError),
  });
  expect(files.get(path)).toBe('first');
  await expect(
    writeTextFile({path, content: 'first', overwrite: true}, workspace, signal),
  ).resolves.toEqual({path, changed: false});
  expect(workspace.write).toHaveBeenCalledTimes(1);
});

it('checks image signatures and reserves the shared response budget', async () => {
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGhsAAAAASUVORK5CYII=';
  const path = 'workspace/image.png';
  const mislabeled = 'workspace/image.jpg';
  const {workspace} = createWorkspace({[path]: png, [mislabeled]: png});
  const budget = {remainingChars: png.length};
  await expect(
    readImageFile({path: mislabeled}, workspace, signal, budget),
  ).rejects.toThrow('图片内容与文件扩展名不匹配');
  const results = await Promise.allSettled([
    readImageFile({path}, workspace, signal, budget),
    readImageFile({path}, workspace, signal, budget),
  ]);
  expect(results).toEqual([
    {status: 'fulfilled', value: {path, mime: 'image/png', content: png}},
    {status: 'rejected', reason: expect.any(FileToolError)},
  ]);
  expect(budget.remainingChars).toBe(0);
});
