import {
  pathFromToolArguments,
  skillPathParts,
  toWorkspacePath,
} from '../src/features/extensions/filePaths';

describe('toWorkspacePath', () => {
  it('接受 workspace/ 与 skills/ 前缀', () => {
    expect(toWorkspacePath('workspace/notes.md')).toBe('workspace/notes.md');
    expect(toWorkspacePath('skills/notes/SKILL.md')).toBe(
      'skills/notes/SKILL.md',
    );
    expect(toWorkspacePath('  workspace/a/b.png  ')).toBe('workspace/a/b.png');
  });

  it('拒绝代码标识符、URL、绝对路径与越界路径', () => {
    for (const raw of [
      '',
      'package.json',
      'README.md',
      'src/config.ts',
      'https://example.com/notes.md',
      '#标题',
      '/etc/passwd.md',
      '../notes.md',
      'a\\b.md',
      'workspace/',
      'workspace/notes',
      'notes',
      'workspace/notes.md 备份.md',
    ]) {
      expect(toWorkspacePath(raw)).toBeNull();
    }
  });

  it('仅在显式允许时补全裸文件名', () => {
    expect(toWorkspacePath('notes.md', {allowBareName: true})).toBe(
      'workspace/notes.md',
    );
    expect(toWorkspacePath('workspace/notes.md', {allowBareName: true})).toBe(
      'workspace/notes.md',
    );
    // 带目录的路径不会被当成 workspace 下的裸文件名。
    expect(toWorkspacePath('src/config.ts', {allowBareName: true})).toBeNull();
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
  it('依次尝试 path、to、from，并允许省略 workspace/ 前缀', () => {
    expect(pathFromToolArguments({path: 'notes.md'})).toBe(
      'workspace/notes.md',
    );
    expect(pathFromToolArguments({to: 'workspace/b.txt'})).toBe(
      'workspace/b.txt',
    );
    expect(pathFromToolArguments({from: 'a.txt'})).toBe('workspace/a.txt');
    expect(pathFromToolArguments({path: 'notes.md', to: 'x.md'})).toBe(
      'workspace/notes.md',
    );
  });

  it('忽略非路径参数', () => {
    expect(pathFromToolArguments({path: 42})).toBeNull();
    expect(pathFromToolArguments({pattern: '**/*.md'})).toBeNull();
    expect(pathFromToolArguments({path: 'src/config.ts'})).toBeNull();
    expect(pathFromToolArguments({})).toBeNull();
  });
});
