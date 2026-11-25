import {strToU8, zipSync} from 'fflate';
import {fileStorage} from '../src/adapters/files/fileStorage';
import type {ClientToolCall} from '../src/domain/chat/types';
import {
  createFileTools,
  fileToolPrompt,
} from '../src/features/extensions/fileTools';
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

const manifest =
  '---\r\nname: notes\r\ndescription: >-\r\n  整理笔记。\r\n---\r\n# 笔记\r\n';
const skillArchive = zipSync({
  'notes/SKILL.md': strToU8(manifest),
  'notes/references/data.json': strToU8('{"name":"笔记"}'),
  'notes/references/example.png': new Uint8Array([137, 80, 78, 71]),
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
  expect(fileToolPrompt(skills)).toContain('skills/notes/SKILL.md');

  const {execute} = createFileTools(skills, true);
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
  ).resolves.toMatchObject({imageUrl: 'data:image/png;base64,iVBORw=='});
  await expect(
    execute(call('write_file', {path, content: '{}', overwrite: true}), signal),
  ).rejects.toThrow('只能写入');

  await toggle('notes');
  await useSkillsStore.getState().hydrate();
  const restored = useSkillsStore.getState().skills;
  expect(restored[0].enabled).toBe(false);
  expect(fileToolPrompt(restored)).not.toContain('skills/notes/SKILL.md');
  await expect(
    createFileTools(restored, true).execute(call('read_file', {path}), signal),
  ).rejects.toThrow('文件不存在');

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
