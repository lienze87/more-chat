import {toByteArray} from 'base64-js';
import {strToU8, zipSync} from 'fflate';
import {fileStorage} from '../src/adapters/files/fileStorage';
import {FILE_LIMITS, JAVASCRIPT_LIMITS} from '../src/config/appConfig';
import type {ClientToolCall} from '../src/domain/chat/types';
import {FileToolError} from '../src/features/extensions/fileToolError';
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
          : {size: new TextEncoder().encode(content).length};
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

it('treats paths without a prefix as workspace files', async () => {
  const {execute} = createFileTools([], false);
  const path = '洛神赋.md';
  await expect(
    execute(call('write_file', {path, content: '# 洛神赋'}), signal),
  ).resolves.toEqual({text: '已保存 workspace/洛神赋.md'});
  expect(await fileStorage.read('workspace/洛神赋.md')).toBe('# 洛神赋');
  await expect(execute(call('read_file', {path}), signal)).resolves.toEqual({
    text: JSON.stringify({content: '# 洛神赋', next_offset: null}),
  });
  await expect(
    execute(call('delete_path', {path, recursive: false}), signal),
  ).resolves.toEqual({
    text: JSON.stringify({deleted: ['workspace/洛神赋.md'], count: 1}),
  });
  expect(await fileStorage.keys()).toEqual([]);
});

it('replaces every match when edit_file receives all', async () => {
  const {execute} = createFileTools([], false);
  const path = 'workspace/repeat.txt';
  await fileStorage.write(path, 'a\na\n');
  await expect(
    execute(
      call('edit_file', {
        path,
        old_text: 'a',
        new_text: 'b',
        all: true,
      }),
      signal,
    ),
  ).resolves.toEqual({
    text: JSON.stringify({path, changed: true, replaced: 2}),
  });
  expect(await fileStorage.read(path)).toBe('b\nb\n');
  await expect(
    execute(call('edit_file', {path, old_text: 'b', new_text: 'c'}), signal),
  ).rejects.toThrow('匹配多处');
});

it('runs a script that lists, reads and filters workspace files', async () => {
  const {definitions, execute} = createFileTools([], false);
  expect(definitions.map(tool => tool.function.name)).toContain('code_exec');
  await fileStorage.write('workspace/orders.json', '[{"id":1},{"id":2}]');
  await fileStorage.write('workspace/notes.md', 'ignored');

  await expect(
    execute(
      call('code_exec', {
        code: `
          const {entries} = await tools.call('list_dir', {path: 'workspace/'});
          const file = entries.find(entry => entry.name.endsWith('.json'));
          const {content} = await tools.call('read_file', {path: 'workspace/' + file.name});
          return JSON.parse(content).filter(order => order.id > 1);
        `,
      }),
      signal,
    ),
  ).resolves.toEqual({text: '[{"id":2}]'});
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

it('limits scripts to registered tools and an isolated JavaScript context', async () => {
  const {execute} = createFileTools([], true);
  const run = (code: string) => execute(call('code_exec', {code}), signal);
  await expect(
    run(
      'return await tools.call("edit_file", {path: "workspace/out.md", old_text: "a", new_text: "b"});',
    ),
  ).rejects.toThrow('脚本可调用的工具');
  await expect(
    run('return await tools.call("code_exec", {code: "return 1"});'),
  ).rejects.toThrow('脚本可调用的工具');
  await expect(
    run(
      'return await tools.call("read_file", {path: "workspace/../secret.md"});',
    ),
  ).rejects.toThrow('相对路径');
  await expect(
    run(
      'return [typeof fetch, typeof process, typeof require, typeof globalThis.callTool];',
    ),
  ).resolves.toEqual({
    text: '["undefined","undefined","undefined","undefined"]',
  });
  expect(await fileStorage.keys()).toEqual([]);
});

it('validates direct and scripted writes before changing the workspace', async () => {
  const {execute} = createFileTools([], false);
  const args = {path: 'workspace/out.md', content: 1};
  await expect(execute(call('write_file', args), signal)).rejects.toThrow(
    'content 必须是字符串',
  );
  await expect(
    execute(
      call('code_exec', {
        code: `return await tools.call('write_file', ${JSON.stringify(args)});`,
      }),
      signal,
    ),
  ).rejects.toThrow('content 必须是字符串');
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
    total: 1,
    next_offset: null,
  });
  expect(await run({pattern: '**/top.json'})).toEqual({
    paths: ['workspace/top.json'],
    total: 1,
    next_offset: null,
  });
  expect(await run({path: 'skills', pattern: '**/data.json'})).toEqual({
    paths: ['skills/notes/references/data.json'],
    total: 1,
    next_offset: null,
  });
  expect(await run({path: 'workspace', pattern: '*.json'})).toEqual({
    paths: ['workspace/[draft].json', 'workspace/top.json'],
    total: 2,
    next_offset: null,
  });
  expect(await run({path: 'workspace', pattern: '**/?.json'})).toEqual({
    paths: ['workspace/.archive/📄.json'],
    total: 1,
    next_offset: null,
  });
  expect(await run({path: 'workspace', pattern: '[draft].json'})).toEqual({
    paths: ['workspace/[draft].json'],
    total: 1,
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
    total: 101,
    next_offset: null,
  });
  await expect(run({pattern: '../*.json'})).rejects.toThrow('相对路径');
  await expect(run({path: 'workspace/missing'})).rejects.toThrow('目录不存在');
  await expect(run({path: 'workspace/top.json'})).rejects.toThrow('目标是文件');
});

it('lists directory metadata and reports the total', async () => {
  const {execute} = createFileTools([], false);
  await fileStorage.write('workspace/meta.txt', 'abc');
  const page = JSON.parse(
    (await execute(call('list_dir', {path: 'workspace', offset: 0}), signal))
      .text,
  );
  expect(page.total).toBe(1);
  expect(page.entries).toEqual([{name: 'meta.txt', type: 'file', size: 3}]);
  await expect(
    execute(call('list_dir', {path: 'workspace', offset: 2}), signal),
  ).rejects.toThrow('offset 超出目录项');
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

it('ignores case when case_sensitive is false', async () => {
  const {execute} = createFileTools([], false);
  const run = async (caseSensitive: boolean) =>
    JSON.parse(
      (
        await execute(
          call('search_text', {
            path: 'workspace',
            query: 'refunded',
            case_sensitive: caseSensitive,
          }),
          signal,
        )
      ).text,
    );
  await fileStorage.write('workspace/refund.txt', 'REFUNDED\nrefunded\n');
  expect((await run(true)).matches).toHaveLength(1);
  expect((await run(false)).matches).toEqual([
    {path: 'workspace/refund.txt', line: 1, text: 'REFUNDED'},
    {path: 'workspace/refund.txt', line: 2, text: 'refunded'},
  ]);
  await expect(
    execute(
      call('search_text', {
        path: 'workspace/missing',
        query: 'refunded',
      }),
      signal,
    ),
  ).rejects.toThrow('目录不存在');
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

it('finds and searches files in code mode and saves multiple artifacts', async () => {
  const {execute} = createFileTools([], false);
  const run = (code: string) => execute(call('code_exec', {code}), signal);
  await fileStorage.write('workspace/data/orders.json', '[{"status":"open"}]');
  const path = 'workspace/report.csv';
  const content = 'status\n' + 'open\n'.repeat(4_000);
  await expect(
    run(`
    const {paths} = await tools.call('find_files', {path: 'workspace', pattern: '**/*.json'});
    const {matches} = await tools.call('search_text', {query: 'open', pattern: '**/*.json'});
    const {content} = await tools.call('read_file', {path: paths[0]});
    const status = JSON.parse(content).find(order => matches[0].text.includes(order.status)).status;
    return await tools.call('write_file', {path: ${JSON.stringify(path)}, content: 'status\\n' + (status + '\\n').repeat(4000)});
  `),
  ).resolves.toEqual({text: JSON.stringify({path})});
  expect(await fileStorage.read(path)).toBe(content);
  await expect(
    run(
      `return await tools.call('write_file', {path: '${path}', content: 'overwrite'});`,
    ),
  ).rejects.toThrow('文件已存在');
  await expect(
    run(`
      await tools.call('write_file', {path: 'workspace/multi/a.txt', content: 'a'});
      await tools.call('write_file', {path: 'workspace/multi/b.txt', content: 'b'});
      return 'ok';
    `),
  ).resolves.toEqual({text: 'ok'});
  expect(await fileStorage.read('workspace/multi/a.txt')).toBe('a');
  expect(await fileStorage.read('workspace/multi/b.txt')).toBe('b');

  const writeLimitMessage = `每次脚本执行最多保存 ${FILE_LIMITS.maxWritesPerScript} 个文件。`;
  const failure = await run(`
    for (let index = 0; index < ${FILE_LIMITS.maxWritesPerScript + 1}; index += 1) {
      await tools.call('write_file', {
        path: 'workspace/batch/' + index + '.txt',
        content: 'x',
      });
    }
  `).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(FileToolError);
  const response = (failure as FileToolError).toResponse();
  expect(response.message).toContain(writeLimitMessage);
  expect(response.saved_paths).toHaveLength(FILE_LIMITS.maxWritesPerScript);
  expect(
    await fileStorage.read(
      `workspace/batch/${FILE_LIMITS.maxWritesPerScript}.txt`,
    ),
  ).toBeUndefined();
  await expect(
    run(
      "return await tools.call('write_file', {path: 'skills/notes/SKILL.md', content: 'x'});",
    ),
  ).rejects.toThrow('只能写入 workspace/');
});

it('exposes UTF-8 and base64 helpers inside scripts', async () => {
  const {execute} = createFileTools([], false);
  const code = `
    const bytes = new TextEncoder().encode('中文');
    return {
      hex: Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join(''),
      text: new TextDecoder().decode(bytes),
      base64: btoa('hello'),
      decoded: atob('aGVsbG8='),
      remaining: tools.remainingCalls,
    };
  `;
  await expect(execute(call('code_exec', {code}), signal)).resolves.toEqual({
    text: JSON.stringify({
      hex: 'e4b8ade69687',
      text: '中文',
      base64: 'aGVsbG8=',
      decoded: 'hello',
      remaining: JAVASCRIPT_LIMITS.maxToolCalls,
    }),
  });
});

it('enforces the script tool call limit and exposes the remaining count', async () => {
  const {execute} = createFileTools([], false);
  const failure = await execute(
    call('code_exec', {
      code: `
        for (let index = 0; index < ${JAVASCRIPT_LIMITS.maxToolCalls}; index += 1) {
          await tools.call('list_dir', {path: 'workspace'});
        }
        if (tools.remainingCalls !== 0) throw new Error('剩余次数不正确');
        await tools.call('list_dir', {path: 'workspace'});
      `,
    }),
    signal,
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain(
    `最多调用 ${JAVASCRIPT_LIMITS.maxToolCalls} 次`,
  );
});

it('reports recent tool calls and script logs when a script fails', async () => {
  const {execute} = createFileTools([], false);
  const failure = await execute(
    call('code_exec', {
      code: `
        console.log('before failure');
        try {
          await tools.call('read_file', {path: 'workspace/missing.md'});
        } catch {}
        await tools.call('list_dir', {path: 'workspace'});
        throw new Error('boom');
      `,
    }),
    signal,
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  const message = (failure as Error).message;
  expect(message).toContain('boom');
  expect(message).toContain('read_file(失败)');
  expect(message).toContain('list_dir(ok)');
  expect(message).toContain('最近日志：before failure');
});

it('wires delete_path and move_path into direct and scripted calls', async () => {
  const {definitions, execute} = createFileTools([], false);
  expect(definitions.map(tool => tool.function.name)).toEqual(
    expect.arrayContaining(['delete_path', 'move_path']),
  );
  await fileStorage.write('workspace/tmp/a.txt', 'a');
  await expect(
    execute(
      call('move_path', {
        from: 'workspace/tmp/a.txt',
        to: 'workspace/tmp/b.txt',
      }),
      signal,
    ),
  ).resolves.toEqual({
    text: JSON.stringify({
      from: 'workspace/tmp/a.txt',
      to: 'workspace/tmp/b.txt',
    }),
  });
  await expect(
    execute(
      call('code_exec', {
        code: "return await tools.call('delete_path', {path: 'workspace/tmp', recursive: true});",
      }),
      signal,
    ),
  ).resolves.toEqual({
    text: JSON.stringify({deleted: ['workspace/tmp/b.txt'], count: 1}),
  });
  expect(await fileStorage.read('workspace/tmp/b.txt')).toBeUndefined();
});

it('interrupts runaway scripts and limits returned text', async () => {
  const {execute} = createFileTools([], false);
  const run = (code: string) => execute(call('code_exec', {code}), signal);
  await expect(run('while (true) {}')).rejects.toThrow('执行超时');
  await expect(
    run(`return "a".repeat(${JAVASCRIPT_LIMITS.maxOutputLength + 1});`),
  ).rejects.toThrow(String(JAVASCRIPT_LIMITS.maxOutputLength));
  await expect(run('return "中文 📝";')).resolves.toEqual({text: '中文 📝'});
});

it('stops waiting for a workspace read when the turn is cancelled', async () => {
  const controller = new AbortController();
  const {execute} = createFileTools([], false);
  let finishRead: ((content: string) => void) | undefined;
  jest.spyOn(fileStorage, 'read').mockImplementationOnce(() => {
    setTimeout(() => controller.abort(), 0);
    return new Promise<string>(finish => {
      finishRead = finish;
    });
  });
  try {
    await expect(
      execute(
        call('code_exec', {
          code: 'return await tools.call("read_file", {path: "workspace/notes.md"});',
        }),
        controller.signal,
      ),
    ).rejects.toThrow('执行已停止');
  } finally {
    finishRead?.('late result');
    jest.restoreAllMocks();
  }
});

it('cancels a script save while waiting to check the workspace', async () => {
  const controller = new AbortController();
  const {execute} = createFileTools([], false);
  let finishList: ((keys: string[]) => void) | undefined;
  jest.spyOn(fileStorage, 'keys').mockImplementationOnce(() => {
    setTimeout(() => controller.abort(), 0);
    return new Promise<string[]>(resolve => {
      finishList = resolve;
    });
  });
  try {
    await expect(
      execute(
        call('code_exec', {
          code: "return await tools.call('write_file', {path: 'workspace/late.txt', content: 'late'});",
        }),
        controller.signal,
      ),
    ).rejects.toThrow('执行已停止');
    finishList?.([]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await fileStorage.read('workspace/late.txt')).toBeUndefined();
  } finally {
    finishList?.([]);
    jest.restoreAllMocks();
  }
});
