import {fileStorage} from '../src/adapters/files/fileStorage';
import {skillRepository} from '../src/adapters/data/repositories/skillRepository';
import type {SkillPackage} from '../src/domain/skills/types';

jest.mock('../src/adapters/files/fileStorage', () => ({
  fileStorage: {
    keys: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
    remove: jest.fn(),
  },
}));

const skill = (
  name: string,
  overrides: Partial<SkillPackage> = {},
): SkillPackage => ({
  name,
  description: `${name} description`,
  enabled: true,
  files: {'SKILL.md': `# ${name}`},
  ...overrides,
});

describe('skillRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads only valid skill records whose key matches the package name', async () => {
    jest
      .mocked(fileStorage.keys)
      .mockResolvedValue([
        'skill/notes',
        'skill/off',
        'skill/malformed',
        'skill/mismatch',
        'other/ignored',
      ]);
    jest.mocked(fileStorage.read).mockImplementation(async key => {
      switch (key) {
        case 'skill/notes':
          return JSON.stringify(skill('notes'));
        case 'skill/off':
          return JSON.stringify(skill('off', {enabled: false}));
        case 'skill/malformed':
          return '{not json';
        case 'skill/mismatch':
          return JSON.stringify(skill('other'));
        default:
          return undefined;
      }
    });

    await expect(skillRepository.load()).resolves.toEqual([
      skill('notes'),
      skill('off', {enabled: false}),
    ]);
    expect(fileStorage.read).not.toHaveBeenCalledWith('other/ignored');
  });

  it('skips records with an invalid shape or non-string file contents', async () => {
    jest
      .mocked(fileStorage.keys)
      .mockResolvedValue(['skill/no-files', 'skill/bad-content', 'skill/null']);
    jest.mocked(fileStorage.read).mockImplementation(async key => {
      switch (key) {
        case 'skill/no-files':
          return JSON.stringify({name: 'no-files', enabled: true});
        case 'skill/bad-content':
          return JSON.stringify(
            skill('bad-content', {
              files: {'SKILL.md': 1 as unknown as string},
            }),
          );
        case 'skill/null':
          return 'null';
        default:
          return undefined;
      }
    });

    await expect(skillRepository.load()).resolves.toEqual([]);
  });

  it('treats missing records as absent', async () => {
    jest.mocked(fileStorage.keys).mockResolvedValue(['skill/missing']);
    jest.mocked(fileStorage.read).mockResolvedValue(undefined);

    await expect(skillRepository.load()).resolves.toEqual([]);
  });

  it('writes and removes skills under the skill namespace', async () => {
    const notes = skill('notes');

    await skillRepository.save(notes);
    expect(fileStorage.write).toHaveBeenCalledWith(
      'skill/notes',
      JSON.stringify(notes),
    );

    await skillRepository.remove('notes');
    expect(fileStorage.remove).toHaveBeenCalledWith('skill/notes');
  });
});
