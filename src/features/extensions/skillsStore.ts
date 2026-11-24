import {create} from 'zustand';
import {fileStorage} from '../../adapters/files/fileStorage';
import type {SkillPackage} from './skillPackage';

const keyFor = (name: string) => `skill/${name}`;

interface SkillsState {
  skills: SkillPackage[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  install: (skill: SkillPackage) => Promise<void>;
  toggle: (name: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

const byName = (a: SkillPackage, b: SkillPackage) =>
  a.name.localeCompare(b.name);

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  skills: [],
  loading: true,
  error: null,

  hydrate: async () => {
    set({loading: true, error: null});
    try {
      const keys = (await fileStorage.keys()).filter(key =>
        key.startsWith('skill/'),
      );
      const records = await Promise.all(keys.map(key => fileStorage.read(key)));
      const skills = records.flatMap(record =>
        record === undefined ? [] : [JSON.parse(record) as SkillPackage],
      );
      set({skills: skills.sort(byName)});
    } catch {
      set({error: '无法读取本地 Skill，请重试。'});
    } finally {
      set({loading: false});
    }
  },

  install: async skill => {
    if (get().skills.some(item => item.name === skill.name)) {
      throw new Error(`已导入 ${skill.name}，请先移除现有 Skill。`);
    }
    await fileStorage.write(keyFor(skill.name), JSON.stringify(skill));
    set(state => ({skills: [...state.skills, skill].sort(byName)}));
  },

  toggle: async name => {
    const skill = get().skills.find(item => item.name === name);
    if (!skill) {
      return;
    }
    const updated = {...skill, enabled: !skill.enabled};
    await fileStorage.write(keyFor(name), JSON.stringify(updated));
    set(state => ({
      skills: state.skills.map(item => (item.name === name ? updated : item)),
    }));
  },

  remove: async name => {
    await fileStorage.remove(keyFor(name));
    set(state => ({skills: state.skills.filter(item => item.name !== name)}));
  },
}));
