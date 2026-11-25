import {importGitHubSkill} from '../src/features/extensions/githubSkill';

const contents = 'https://api.github.com/repos/octocat/example/contents';
const raw = 'https://raw.githubusercontent.com/octocat/example/main';
const manifest = '---\nname: notes\ndescription: 整理笔记\n---\n# 笔记\n';

const file = (path: string, size: number) => ({
  type: 'file',
  name: path.split('/').at(-1),
  size,
  download_url: `${raw}/${path}`,
});

afterEach(() => jest.restoreAllMocks());

it('imports a Skill file link with supported files from its directory', async () => {
  const responses = new Map([
    [
      `${contents}/tools/notes?ref=main`,
      JSON.stringify([
        file('tools/notes/SKILL.md', 70),
        {name: 'references', type: 'dir'},
        file('tools/notes/script.sh', 30),
      ]),
    ],
    [
      `${contents}/tools/notes/references?ref=main`,
      JSON.stringify([file('tools/notes/references/tips.md', 40)]),
    ],
    [`${raw}/tools/notes/SKILL.md`, manifest],
    [`${raw}/tools/notes/references/tips.md`, '参考内容'],
  ]);
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async url => {
      const body = responses.get(String(url));
      return new Response(body, {status: body === undefined ? 404 : 200});
    });

  await expect(
    importGitHubSkill(
      'https://github.com/octocat/example/blob/main/tools/notes/SKILL.md',
    ),
  ).resolves.toMatchObject({
    name: 'notes',
    enabled: true,
    files: {'SKILL.md': manifest, 'references/tips.md': '参考内容'},
  });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it('uses the repository default branch for a root link and rejects oversized files before download', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            file('SKILL.md', 70),
            file('large.md', 1024 * 1024 + 1),
          ]),
        ),
    );
  await expect(
    importGitHubSkill('https://github.com/octocat/example'),
  ).rejects.toThrow('大小或数量');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(contents, expect.any(Object));
});

it('resolves a branch with a slash and rejects links on other hosts', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async url => {
      if (url === `${contents}/notes?ref=release%2Fnext`) {
        return new Response(JSON.stringify([file('notes/SKILL.md', 70)]));
      }
      if (url === `${raw}/notes/SKILL.md`) {
        return new Response(manifest);
      }
      return new Response(null, {status: 404});
    });
  await expect(
    importGitHubSkill(
      'https://github.com/octocat/example/tree/release/next/notes',
    ),
  ).resolves.toMatchObject({name: 'notes'});
  await expect(
    importGitHubSkill('https://github.com.example.org/octocat/example'),
  ).rejects.toThrow('HTTPS 链接');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
