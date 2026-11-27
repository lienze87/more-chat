import {toByteArray} from 'base64-js';
import {strToU8, zipSync} from 'fflate';
import {fileStorage} from '../src/adapters/files/fileStorage';
import type {ClientToolCall} from '../src/domain/chat/types';
import {createFileTools} from '../src/features/extensions/fileTools';
import {
  createSkillPackage,
  parseSkillPackage,
} from '../src/features/extensions/skillPackage';
import {useSkillsStore} from '../src/features/extensions/skillsStore';

jest.mock('../src/adapters/files/fileStorage', () => {
  const files = new Map<string, string>();
  return {
    fileStorage: {
      keys: async () => [...files.keys()],
      read: async (path: string) => files.get(path),
      write: async (path: string, value: string) => {
        files.set(path, value);
      },
      remove: async (path: string) => {
        files.delete(path);
      },
    },
  };
});

const samplePng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGhsAAAAASUVORK5CYII=';
const manifest =
  '---\r\nname: notes\r\ndescription: >-\r\n  整理笔记。\r\n---\r\n# 笔记\r\n';
const skillArchive = zipSync({
  'notes/SKILL.md': strToU8(manifest),
  'notes/references/data.json': strToU8('{"name":"笔记"}'),
  'notes/references/example.png': toByteArray(samplePng),
});
const signal = new AbortController().signal;

const call = (name: string, args: Record<string, unknown>): ClientToolCall => ({
  id: 'tool',
  name,
  argumentsText: JSON.stringify(args),
  status: 'running',
});

beforeEach(async () => {
  await Promise.all(
    (await fileStorage.keys()).map(key => fileStorage.remove(key)),
  );
  await useSkillsStore.getState().hydrate();
});

it('discovers an imported skill, restores its setting and excludes disabled files', async () => {
  const skill = parseSkillPackage('notes.zip', skillArchive);
  await useSkillsStore.getState().install(skill);
  await useSkillsStore.getState().hydrate();
  const {skills, toggle, remove} = useSkillsStore.getState();
  const {execute, prompt} = createFileTools(skills, true);
  expect(prompt).toContain('skills/notes/SKILL.md');
  const path = 'skills/notes/references/data.json';
  expect(
    JSON.parse((await execute(call('read_file', {path}), signal)).text),
  ).toEqual({
    content: '{"name":"笔记"}',
    next_offset: null,
  });
  await expect(
    execute(
      call('read_image', {path: 'skills/notes/references/example.png'}),
      signal,
    ),
  ).resolves.toMatchObject({imageUrl: `data:image/png;base64,${samplePng}`});
  await expect(
    execute(call('write_file', {path, content: '{}', overwrite: true}), signal),
  ).rejects.toThrow('只能写入');

  await toggle('notes');
  await useSkillsStore.getState().hydrate();
  const restored = useSkillsStore.getState().skills;
  expect(restored[0].enabled).toBe(false);
  const nextTools = createFileTools(restored, true);
  expect(nextTools.prompt).not.toContain('skills/notes/SKILL.md');
  await expect(
    nextTools.execute(call('read_file', {path}), signal),
  ).rejects.toThrow('文件不存在');
  await expect(
    execute(call('read_file', {path}), signal),
  ).resolves.toMatchObject({
    text: expect.stringContaining('笔记'),
  });

  await remove('notes');
  await useSkillsStore.getState().hydrate();
  expect(useSkillsStore.getState().skills).toEqual([]);
});

it('rejects traversal in a ZIP and validates SKILL.md metadata', () => {
  expect(() =>
    parseSkillPackage(
      'notes.zip',
      zipSync({
        'SKILL.md': strToU8(manifest),
        '../out.md': strToU8('x'),
      }),
    ),
  ).toThrow('相对路径');
  expect(() =>
    parseSkillPackage('SKILL.md', strToU8('---\nname: X\n---\n# Test')),
  ).toThrow('Skill 名称');
});

it('creates a valid Skill from the form fields and restores it from storage', async () => {
  const description = '整理笔记：保留标题。\n---\n支持多行。';
  const skill = createSkillPackage(
    ' notes ',
    description,
    '# 工具\n\n整理笔记。',
  );
  const {install} = useSkillsStore.getState();
  const installed = install(skill);
  await expect(install(skill)).rejects.toThrow('正在导入');
  await installed;
  await useSkillsStore.getState().hydrate();
  expect(useSkillsStore.getState().skills).toEqual([skill]);
  expect(skill.description).toBe(description);
  expect(skill.files['SKILL.md']).toContain('# 工具');
  await expect(useSkillsStore.getState().install(skill)).rejects.toThrow(
    '已导入',
  );
  expect(() => createSkillPackage('not a slug', description, '# 工具')).toThrow(
    '名称须为',
  );
  expect(() => createSkillPackage('notes', description, ' ')).toThrow('正文');
});

it('lists and safely creates, reads and edits workspace files', async () => {
  const {execute} = createFileTools([], false);
  const run = (name: string, args: Record<string, unknown>) =>
    execute(call(name, args), signal);
  const path = 'workspace/drafts/notes.md';
  await run('write_file', {path, content: '一条笔记'});
  await expect(run('write_file', {path, content: '意外覆盖'})).rejects.toThrow(
    '已存在',
  );
  await run('edit_file', {path, old_text: '一条', new_text: '两条'});
  expect(JSON.parse((await run('read_file', {path})).text).content).toBe(
    '两条笔记',
  );
  expect(
    JSON.parse((await run('list_dir', {path: 'workspace/'})).text).entries,
  ).toEqual([{name: 'drafts', type: 'directory'}]);
  await expect(
    run('read_file', {path: 'workspace/drafts/../../secret.json'}),
  ).rejects.toThrow('相对路径');
});

it('keeps declarations and direct calls aligned with the model capabilities', async () => {
  const textTools = createFileTools([], false);
  const imageTools = createFileTools([], true);
  const image = call('read_image', {path: 'workspace/example.png'});
  expect(textTools.definitions.map(tool => tool.function.name)).not.toContain(
    image.name,
  );
  expect(imageTools.definitions.map(tool => tool.function.name)).toContain(
    image.name,
  );
  expect(textTools.has(image.name)).toBe(false);
  expect(imageTools.has(image.name)).toBe(true);
  await expect(textTools.execute(image, signal)).rejects.toThrow(
    '不可用的客户端工具',
  );
});

it('validates writes before changing the workspace', async () => {
  const {execute} = createFileTools([], false);
  const args = {path: 'workspace/out.md', content: 1};
  await expect(execute(call('write_file', args), signal)).rejects.toThrow(
    'content 必须是字符串',
  );
  expect(await fileStorage.keys()).toEqual([]);
});

it('publishes the Zod input schema and rejects undeclared arguments', async () => {
  const {definitions, execute} = createFileTools([], false);
  const definition = definitions.find(
    tool => tool.function.name === 'write_file',
  );
  expect(definition?.function.parameters).toMatchObject({
    required: ['path', 'content'],
    additionalProperties: false,
    properties: {overwrite: {type: 'boolean', default: false}},
  });
  await expect(
    execute(
      call('write_file', {
        path: 'workspace/out.md',
        content: 'test',
        extra: true,
      }),
      signal,
    ),
  ).rejects.toThrow('包含未声明的参数');
  expect(await fileStorage.keys()).toEqual([]);
});

it('finds files recursively with relative patterns and path pagination', async () => {
  const enabled = parseSkillPackage('notes.zip', skillArchive);
  const {definitions, execute} = createFileTools([enabled], false);
  const run = async (args: Record<string, unknown>) =>
    JSON.parse((await execute(call('find_files', args), signal)).text);
  expect(definitions.map(tool => tool.function.name)).toEqual(
    expect.arrayContaining(['find_files', 'search_text']),
  );
  await fileStorage.write('workspace/top.json', '{}');
  await fileStorage.write('workspace/a/b/deep1.json', '{}');
  await fileStorage.write('workspace/a/b/deep12.json', '{}');
  await fileStorage.write('workspace/.archive/📄.json', '{}');
  await fileStorage.write('workspace/[draft].json', '{}');
  expect(await run({path: 'workspace/', pattern: '**/deep?.json'})).toEqual({
    paths: ['workspace/a/b/deep1.json'],
    next_offset: null,
  });
  expect(await run({pattern: '**/top.json'})).toEqual({
    paths: ['workspace/top.json'],
    next_offset: null,
  });
  expect(await run({path: 'skills', pattern: '**/data.json'})).toEqual({
    paths: ['skills/notes/references/data.json'],
    next_offset: null,
  });
  expect(await run({path: 'workspace', pattern: '*.json'})).toEqual({
    paths: ['workspace/[draft].json', 'workspace/top.json'],
    next_offset: null,
  });
  expect(await run({path: 'workspace', pattern: '**/?.json'})).toEqual({
    paths: ['workspace/.archive/📄.json'],
    next_offset: null,
  });
  expect(await run({path: 'workspace', pattern: '[draft].json'})).toEqual({
    paths: ['workspace/[draft].json'],
    next_offset: null,
  });
  await Promise.all(
    Array.from({length: 101}, (_, index) =>
      fileStorage.write(
        `workspace/batch/${String(index).padStart(3, '0')}.txt`,
        '',
      ),
    ),
  );
  const first = await run({path: 'workspace/batch'});
  expect(first.paths).toHaveLength(100);
  expect(first.next_offset).toBe(100);
  expect(
    await run({path: 'workspace/batch', offset: first.next_offset}),
  ).toEqual({
    paths: ['workspace/batch/100.txt'],
    next_offset: null,
  });
  await expect(run({pattern: '../*.json'})).rejects.toThrow('相对路径');
});

it('searches literal matches with line numbers and resumes within a file', async () => {
  const skill = parseSkillPackage('notes.zip', skillArchive);
  const {execute} = createFileTools([{...skill, enabled: false}], false);
  const run = async (args: Record<string, unknown>) =>
    JSON.parse(
      (await execute(call('search_text', {query: 'a.b', ...args}), signal))
        .text,
    );
  await fileStorage.write(
    'workspace/report.txt',
    `aXb\r\n${'x'.repeat(300)}a.b${'y'.repeat(300)}\r\n${'a.b\n'.repeat(30)}A.B`,
  );
  await fileStorage.write('workspace/skipped.png', 'a.b');
  const first = await run({});
  expect(first.matches).toHaveLength(30);
  expect(first.matches[0]).toEqual({
    path: 'workspace/report.txt',
    line: 2,
    text: `…${'x'.repeat(60)}a.b${'y'.repeat(177)}…`,
  });
  expect(await run({cursor: first.next_cursor})).toEqual({
    matches: [{path: 'workspace/report.txt', line: 32, text: 'a.b'}],
    next_cursor: null,
  });
  expect(await run({query: '笔记'})).toEqual({matches: [], next_cursor: null});
  await expect(run({query: ''})).rejects.toThrow('单行文本');
  await expect(run({cursor: {file: 0, line: -1, offset: 0}})).rejects.toThrow(
    'next_cursor',
  );
});

it('returns a cursor when the first search page has no matches', async () => {
  const {execute} = createFileTools([], false);
  await Promise.all(
    Array.from({length: 24}, (_, index) =>
      fileStorage.write(`workspace/${index}.txt`, 'none'),
    ),
  );
  await fileStorage.write('workspace/z.txt', 'needle');
  const run = async (cursor?: unknown) =>
    JSON.parse(
      (await execute(call('search_text', {query: 'needle', cursor}), signal))
        .text,
    );
  const first = await run();
  expect(first.matches).toEqual([]);
  expect(first.next_cursor).not.toBeNull();
  expect(await run(first.next_cursor)).toEqual({
    matches: [{path: 'workspace/z.txt', line: 1, text: 'needle'}],
    next_cursor: null,
  });
});

it('resumes after scanning a long line without a match', async () => {
  const {execute} = createFileTools([], false);
  await fileStorage.write(
    'workspace/long.log',
    `${'x'.repeat(1_000_000)}\rneedle`,
  );
  const run = async (cursor?: unknown) =>
    JSON.parse(
      (await execute(call('search_text', {query: 'needle', cursor}), signal))
        .text,
    );
  const first = await run();
  expect(first.matches).toEqual([]);
  expect(first.next_cursor).not.toBeNull();
  expect(await run(first.next_cursor)).toEqual({
    matches: [{path: 'workspace/long.log', line: 2, text: 'needle'}],
    next_cursor: null,
  });
});
