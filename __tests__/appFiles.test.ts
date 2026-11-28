import {fileStorage} from '../src/adapters/files/fileStorage';
import {readAppFile, readSkillFile} from '../src/features/extensions/appFiles';
import type {SkillPackage} from '../src/features/extensions/skillPackage';

jest.mock('../src/adapters/files/fileStorage', () => ({
  fileStorage: {read: jest.fn()},
}));

const skill = (
  name: string,
  enabled: boolean,
  files: Record<string, string>,
): SkillPackage => ({name, description: name, enabled, files});

const skills = [
  skill('notes', true, {'SKILL.md': '# 笔记', 'refs/a.md': 'A'}),
  skill('private', false, {'SKILL.md': '# 未启用'}),
];

describe('readSkillFile', () => {
  it('reads enabled skills and their nested files', () => {
    expect(readSkillFile('skills/notes/SKILL.md', skills, 'enabled')).toBe(
      '# 笔记',
    );
    expect(readSkillFile('skills/notes/refs/a.md', skills, 'enabled')).toBe(
      'A',
    );
  });

  it('hides disabled skills from tool access but exposes them to previews', () => {
    expect(
      readSkillFile('skills/private/SKILL.md', skills, 'enabled'),
    ).toBeUndefined();
    expect(readSkillFile('skills/private/SKILL.md', skills, 'all')).toBe(
      '# 未启用',
    );
  });

  it('returns undefined for missing files, unknown skills and non-skill paths', () => {
    expect(
      readSkillFile('skills/notes/missing.md', skills, 'enabled'),
    ).toBeUndefined();
    expect(
      readSkillFile('skills/absent/SKILL.md', skills, 'enabled'),
    ).toBeUndefined();
    expect(readSkillFile('workspace/a.md', skills, 'enabled')).toBeUndefined();
    expect(readSkillFile('skills/notes', skills, 'enabled')).toBeUndefined();
  });

  it('does not read inherited object properties as files', () => {
    expect(
      readSkillFile('skills/notes/toString', skills, 'enabled'),
    ).toBeUndefined();
  });
});

describe('readAppFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes workspace paths through file storage', async () => {
    jest.mocked(fileStorage.read).mockResolvedValue('工作区内容');

    await expect(
      readAppFile('workspace/notes.md', skills, {skillAccess: 'enabled'}),
    ).resolves.toBe('工作区内容');
    expect(fileStorage.read).toHaveBeenCalledWith('workspace/notes.md');
  });

  it('keeps skill reads out of file storage', async () => {
    await expect(
      readAppFile('skills/notes/SKILL.md', skills, {skillAccess: 'enabled'}),
    ).resolves.toBe('# 笔记');
    expect(fileStorage.read).not.toHaveBeenCalled();
  });
});
