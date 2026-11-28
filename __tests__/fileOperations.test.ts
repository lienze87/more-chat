import {strToU8} from 'fflate';
import {
  deletePath,
  editTextFile,
  findFiles,
  listDirectory,
  movePath,
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
    remove: async (path: string) => {
      files.delete(path);
    },
    rename: async (from: string, to: string, overwrite: boolean) => {
      const content = files.get(from);
      if (content === undefined) throw new Error('文件不存在。');
      if (!overwrite && files.has(to)) throw new Error('文件已存在。');
      files.set(to, content);
      files.delete(from);
    },
    stat: async (path: string) => {
      const content = files.get(path);
      return content === undefined
        ? undefined
        : {size: strToU8(content).length};
    },
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
  ).resolves.toEqual({path, changed: false, replaced: 1});
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
  expect(first).toEqual({
    status: 'fulfilled',
    value: {path, changed: true, bytes: 5},
  });
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
  ).resolves.toEqual({path, changed: false, bytes: 5});
  expect(workspace.write).toHaveBeenCalledTimes(1);
});

it('deletes files and recursive directories only inside workspace', async () => {
  const {workspace, files} = createWorkspace({
    'workspace/a.md': 'a',
    'workspace/dir/b.md': 'b',
    'workspace/dir/c.md': 'c',
    'skills/notes/SKILL.md': 'x',
  });
  await expect(
    deletePath({path: 'workspace/a.md', recursive: false}, workspace, signal),
  ).resolves.toEqual({deleted: ['workspace/a.md'], count: 1});
  await expect(
    deletePath({path: 'workspace/dir', recursive: false}, workspace, signal),
  ).rejects.toThrow('recursive');
  await expect(
    deletePath({path: 'workspace/dir', recursive: true}, workspace, signal),
  ).resolves.toEqual({
    deleted: ['workspace/dir/b.md', 'workspace/dir/c.md'],
    count: 2,
  });
  expect([...files.keys()]).toEqual(['skills/notes/SKILL.md']);
  await expect(
    deletePath(
      {path: 'skills/notes/SKILL.md', recursive: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('只能删除 workspace/');
  await expect(
    deletePath({path: 'workspace', recursive: true}, workspace, signal),
  ).rejects.toThrow('根目录');
  await expect(
    deletePath(
      {path: 'workspace/missing.md', recursive: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('不存在');
});

it('moves files with overwrite protection and rejects directories', async () => {
  const {workspace, files} = createWorkspace({
    'workspace/a.md': 'a',
    'workspace/b.md': 'b',
    'workspace/dir/c.md': 'c',
  });
  await expect(
    movePath(
      {from: 'workspace/a.md', to: 'workspace/sub/a.md', overwrite: false},
      workspace,
      signal,
    ),
  ).resolves.toEqual({
    from: 'workspace/a.md',
    to: 'workspace/sub/a.md',
  });
  expect(files.get('workspace/sub/a.md')).toBe('a');
  await expect(
    movePath(
      {from: 'workspace/sub/a.md', to: 'workspace/b.md', overwrite: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('已存在');
  await expect(
    movePath(
      {from: 'workspace/sub/a.md', to: 'workspace/b.md', overwrite: true},
      workspace,
      signal,
    ),
  ).resolves.toEqual({
    from: 'workspace/sub/a.md',
    to: 'workspace/b.md',
  });
  expect(files.get('workspace/b.md')).toBe('a');
  await expect(
    movePath(
      {from: 'workspace/dir', to: 'workspace/moved', overwrite: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('暂不支持移动目录');
  await expect(
    movePath(
      {from: 'workspace/b.md', to: 'workspace/dir', overwrite: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('冲突');
  await expect(
    movePath(
      {from: 'workspace/missing.md', to: 'workspace/x.md', overwrite: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('源文件不存在');
});

it('enforces a byte budget on a single save', async () => {
  const {workspace, files} = createWorkspace({'workspace/a.md': '12345'});
  await expect(
    writeTextFile(
      {path: 'workspace/a.md', content: '123456', overwrite: true},
      workspace,
      signal,
      3,
    ),
  ).rejects.toThrow('写入总量');
  expect(files.get('workspace/a.md')).toBe('12345');
  await expect(
    writeTextFile(
      {path: 'workspace/a.md', content: '123', overwrite: true},
      workspace,
      signal,
      3,
    ),
  ).resolves.toEqual({path: 'workspace/a.md', changed: true, bytes: 3});
});

it('uses explicit roots for files and directories', async () => {
  const {workspace, files} = createWorkspace({
    'workspace/notes.md': '笔记',
    'workspace/dir/a.md': 'a',
  });
  await expect(
    readTextFile({path: 'workspace/notes.md', offset: 0}, workspace, signal),
  ).resolves.toEqual({content: '笔记', next_offset: null});
  await expect(
    listDirectory({path: 'workspace/dir/', offset: 0}, workspace),
  ).resolves.toMatchObject({entries: [{name: 'a.md', type: 'file', size: 1}]});
  await expect(
    findFiles({path: '.', pattern: '**/a.md', offset: 0}, workspace),
  ).resolves.toMatchObject({paths: ['workspace/dir/a.md']});

  await writeTextFile(
    {path: 'workspace/洛神赋.md', content: '# 洛神赋', overwrite: false},
    workspace,
    signal,
  );
  expect(files.get('workspace/洛神赋.md')).toBe('# 洛神赋');
  await expect(
    editTextFile(
      {
        path: 'workspace/洛神赋.md',
        old_text: '# 洛神赋',
        new_text: '# 洛神赋 并序',
      },
      workspace,
      signal,
    ),
  ).resolves.toEqual({
    path: 'workspace/洛神赋.md',
    changed: true,
    replaced: 1,
  });
  await expect(
    movePath(
      {
        from: 'workspace/洛神赋.md',
        to: 'workspace/drafts/洛神赋.md',
        overwrite: false,
      },
      workspace,
      signal,
    ),
  ).resolves.toEqual({
    from: 'workspace/洛神赋.md',
    to: 'workspace/drafts/洛神赋.md',
  });
  await expect(
    deletePath(
      {path: 'workspace/drafts/洛神赋.md', recursive: false},
      workspace,
      signal,
    ),
  ).resolves.toEqual({deleted: ['workspace/drafts/洛神赋.md'], count: 1});
  await expect(
    writeTextFile(
      {path: 'skills/notes/SKILL.md', content: 'x', overwrite: true},
      workspace,
      signal,
    ),
  ).rejects.toThrow('只能写入');
});

it('rejects bare paths for file operations and directory searches', async () => {
  const {workspace} = createWorkspace({
    'workspace/notes.md': '内容',
    'workspace/reports/today.md': '今天',
  });
  const operations = [
    readTextFile({path: 'notes.md', offset: 0}, workspace, signal),
    writeTextFile(
      {path: 'reports/new.md', content: '', overwrite: false},
      workspace,
      signal,
    ),
    movePath(
      {from: 'workspace/notes.md', to: 'reports/notes.md', overwrite: false},
      workspace,
      signal,
    ),
    deletePath({path: 'reports', recursive: true}, workspace, signal),
    listDirectory({path: 'reports', offset: 0}, workspace),
    findFiles(
      {path: './workspace/reports', pattern: '**', offset: 0},
      workspace,
    ),
  ];
  await Promise.all(
    operations.map(operation =>
      expect(operation).rejects.toThrow('应用内路径'),
    ),
  );
});

it('reads the last lines with tail_lines', async () => {
  const path = 'workspace/log.txt';
  const {workspace} = createWorkspace({[path]: 'a\nb\nc\n'});
  await expect(
    readTextFile({path, offset: 0, tail_lines: 2}, workspace, signal),
  ).resolves.toEqual({
    content: 'b\nc\n',
    start_line: 2,
    end_line: 3,
    next_offset: null,
  });
  await expect(
    readTextFile({path, offset: 0, tail_lines: 10}, workspace, signal),
  ).resolves.toEqual({
    content: 'a\nb\nc\n',
    start_line: 1,
    end_line: 3,
    next_offset: null,
  });
});

it('replaces all matches and reports the replaced count', async () => {
  const path = 'workspace/notes.md';
  const {workspace, files} = createWorkspace({[path]: 'a\nb\na\n'});
  await expect(
    editTextFile(
      {path, old_text: 'a', new_text: 'x', all: true},
      workspace,
      signal,
    ),
  ).resolves.toEqual({path, changed: true, replaced: 2});
  expect(files.get(path)).toBe('x\nb\nx\n');
  await expect(
    editTextFile(
      {path, old_text: 'x', new_text: 'y', all: false},
      workspace,
      signal,
    ),
  ).rejects.toThrow('匹配多处');
});

it('lists metadata and totals, and rejects offsets past the end', async () => {
  const {workspace} = createWorkspace({
    'workspace/a.md': 'abc',
    'workspace/dir/b.md': 'b',
  });
  const page = await listDirectory({path: 'workspace', offset: 0}, workspace);
  expect(page.total).toBe(2);
  expect(page.entries).toEqual([
    {name: 'a.md', type: 'file', size: 3},
    {name: 'dir', type: 'directory'},
  ]);
  await expect(
    listDirectory({path: 'workspace', offset: 3}, workspace),
  ).rejects.toThrow('offset 超出目录项');

  const files = await findFiles(
    {path: 'workspace', pattern: '**/*.md', offset: 0},
    workspace,
  );
  expect(files.total).toBe(2);
  await expect(
    findFiles({path: 'workspace', pattern: '**/*.md', offset: 3}, workspace),
  ).rejects.toThrow('offset 超出结果数');
  await expect(
    findFiles({path: 'workspace/missing', pattern: '**', offset: 0}, workspace),
  ).rejects.toThrow('目录不存在');
  await expect(
    findFiles({path: 'workspace/a.md', pattern: '**', offset: 0}, workspace),
  ).rejects.toThrow('目标是文件');
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
