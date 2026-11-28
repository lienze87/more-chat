/** 已安装 Skill 的持久化模型。 */
export interface SkillPackage {
  name: string;
  description: string;
  enabled: boolean;
  files: Record<string, string>;
}
