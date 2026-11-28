import {skillRepository} from '../src/adapters/data/repositories/skillRepository';
import {useSkillsStore} from '../src/features/extensions/skillsStore';
import type {SkillPackage} from '../src/domain/skills/types';

jest.mock('../src/adapters/data/repositories/skillRepository', () => ({
  skillRepository: {
    load: jest.fn(),
    save: jest.fn(),
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

describe('useSkillsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSkillsStore.setState({skills: [], loading: false, error: null});
  });

  it('hydrates and sorts skills by name', async () => {
    jest
      .mocked(skillRepository.load)
      .mockResolvedValue([skill('zeta'), skill('alpha')]);

    await useSkillsStore.getState().hydrate();

    expect(useSkillsStore.getState().skills.map(item => item.name)).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(useSkillsStore.getState().loading).toBe(false);
  });

  it('keeps the previous list and reports a load error', async () => {
    useSkillsStore.setState({skills: [skill('stale')]});
    jest.mocked(skillRepository.load).mockRejectedValue(new Error('disk'));

    await useSkillsStore.getState().hydrate();

    expect(useSkillsStore.getState().error).toContain('无法读取本地 Skill');
    expect(useSkillsStore.getState().skills.map(item => item.name)).toEqual([
      'stale',
    ]);
  });

  it('installs, toggles and removes through the repository', async () => {
    const notes = skill('notes');
    await useSkillsStore.getState().install(notes);

    expect(skillRepository.save).toHaveBeenCalledWith(notes);
    expect(useSkillsStore.getState().skills).toEqual([notes]);

    await expect(useSkillsStore.getState().install(notes)).rejects.toThrow(
      '已导入 notes',
    );

    await useSkillsStore.getState().toggle('notes');
    expect(skillRepository.save).toHaveBeenCalledWith({
      ...notes,
      enabled: false,
    });
    expect(useSkillsStore.getState().skills[0].enabled).toBe(false);

    await useSkillsStore.getState().remove('notes');
    expect(skillRepository.remove).toHaveBeenCalledWith('notes');
    expect(useSkillsStore.getState().skills).toEqual([]);
  });
});
