import {MarkdownIt} from 'react-native-markdown-display';
import {
  localFilePathFromHref,
  pathFromToolArguments,
  skillPathParts,
  toLocalFileLink,
  toLocalFilePath,
} from '../src/features/extensions/filePaths';

describe('local file paths', () => {
  it.each([
    'workspace/报告/项目 计划.md',
    'workspace/report..v1.md',
    'workspace/a/b.png',
    'skills/notes/references/日报.md',
  ])('accepts a file with an explicit root: %s', path => {
    expect(toLocalFilePath(path)).toBe(path);
    expect(toLocalFileLink(path)).toBe(path);
  });

  it.each([
    '',
    'README.md',
    'reports/notes.md',
    'https://example.com/notes.md',
    '/workspace/notes.md',
    './workspace/notes.md',
    'workspace/../notes.md',
    'workspace/./notes.md',
    'workspace/a\\b.md',
    'workspace//notes.md',
    'workspace/',
    'skills/notes.md',
    'workspace/' + '文'.repeat(60) + '.md',
  ])('rejects paths outside the file path format: %s', path => {
    expect(toLocalFilePath(path)).toBeNull();
  });

  it('accepts an extensionless workspace file at an explicit preview entry point', () => {
    expect(toLocalFilePath('workspace/notes')).toBe('workspace/notes');
    expect(toLocalFileLink('workspace/notes')).toBeNull();
  });
});

describe('Markdown file link targets', () => {
  const markdown = MarkdownIt({typographer: true});

  it.each([
    'workspace/日报.md',
    'workspace/项目 计划.md',
    'skills/notes/references/report..v1.md',
  ])('decodes the Markdown parser output for %s', path => {
    const tokens = markdown.parse(`[打开](<${path}>)`, {});
    const href = tokens[1].children?.[0].attrGet('href');
    expect(localFilePathFromHref(href ?? '')).toBe(path);
  });

  it('decodes once and validates the decoded path', () => {
    expect(localFilePathFromHref('workspace/report%2520.md')).toBe(
      'workspace/report%20.md',
    );
    expect(localFilePathFromHref('workspace/%2e%2e/secret.md')).toBeNull();
    expect(localFilePathFromHref('workspace/%E6.md')).toBeNull();
    expect(localFilePathFromHref('report.md')).toBeNull();
  });
});

describe('skillPathParts', () => {
  it('拆分 Skill 名称与包内路径', () => {
    expect(skillPathParts('skills/notes/SKILL.md')).toEqual({
      name: 'notes',
      relative: 'SKILL.md',
    });
    expect(skillPathParts('skills/notes/references/data.json')).toEqual({
      name: 'notes',
      relative: 'references/data.json',
    });
  });

  it('只接受带包内路径的 skills/ 路径', () => {
    expect(skillPathParts('skills/notes')).toBeNull();
    expect(skillPathParts('skills/')).toBeNull();
    expect(skillPathParts('workspace/notes.md')).toBeNull();
  });
});

describe('pathFromToolArguments', () => {
  it('checks path, to, and from for an explicitly rooted file', () => {
    expect(
      pathFromToolArguments({
        path: 'workspace/notes.md',
        to: 'workspace/b.txt',
      }),
    ).toBe('workspace/notes.md');
    expect(
      pathFromToolArguments({path: 'notes.md', to: 'workspace/b.txt'}),
    ).toBe('workspace/b.txt');
    expect(pathFromToolArguments({from: 'workspace/a.txt'})).toBe(
      'workspace/a.txt',
    );
  });

  it('ignores bare paths and non-path arguments', () => {
    expect(pathFromToolArguments({path: 42})).toBeNull();
    expect(pathFromToolArguments({pattern: '**/*.md'})).toBeNull();
    expect(pathFromToolArguments({path: 'src/config.ts'})).toBeNull();
    expect(pathFromToolArguments({path: 'notes.md'})).toBeNull();
    expect(pathFromToolArguments({})).toBeNull();
  });
});
