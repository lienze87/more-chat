/**
 * 模型目录与能力。
 *
 * 这里是模型标识、设置页预设和视觉能力的唯一来源：新增模型只改这张表。
 */
export const DEFAULT_MODEL = 'deepseek-flash';

interface ModelCapability {
  supportsImages: boolean;
  /** 是否出现在设置页的模型预设里。 */
  preset: boolean;
}

const MODELS = {
  'deepseek-flash': {supportsImages: true, preset: true},
  'deepseek-v4-pro': {supportsImages: false, preset: true},
  // 实验性视觉模型，允许手动输入，但不作为默认预设。
  'deepseek-v4-flash-vision-exp': {supportsImages: true, preset: false},
} as const satisfies Record<string, ModelCapability>;

export interface ModelPreset {
  label: string;
  value: string;
}

/** 设置页展示的模型预设，顺序由目录表决定。 */
export const MODEL_PRESETS: readonly ModelPreset[] = Object.entries(MODELS)
  .filter(([, capability]) => capability.preset)
  .map(([value]) => ({label: value, value}));

/** 空白模型名回退到默认模型，其余值只做 trim。 */
export function resolveModel(model: string): string {
  return model.trim() || DEFAULT_MODEL;
}

/** 当前模型是否支持图片输入；未知模型按不支持处理。 */
export function modelSupportsImages(model: string): boolean {
  const capability = MODELS[resolveModel(model) as keyof typeof MODELS];
  return capability?.supportsImages ?? false;
}
