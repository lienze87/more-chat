import type {Settings} from '../settings/types';

/**
 * 服务端工具能力表。
 *
 * 请求里要声明哪些工具、`<env_info>` 里要告诉模型哪些能力，都从这里派生；
 * 新增服务端工具时只改这张表。
 */
export interface ServerToolCapability {
  /** DeepSeek Chat Completions 的工具类型。 */
  type: 'deepseek_web_search' | 'deepseek_read_url';
  /** 设置页对应的开关。 */
  setting: 'webSearch' | 'readUrl';
  /** 写入 `<env_info>` 的可用能力名称。 */
  label: string;
}

export const SERVER_TOOL_CAPABILITIES = [
  {type: 'deepseek_web_search', setting: 'webSearch', label: '联网搜索'},
  {type: 'deepseek_read_url', setting: 'readUrl', label: '阅读链接'},
] as const satisfies readonly ServerToolCapability[];

/** 当前设置启用的服务端工具，顺序与能力表一致。 */
export function enabledServerToolCapabilities(
  settings: Pick<Settings, 'webSearch' | 'readUrl'>,
): ServerToolCapability[] {
  return SERVER_TOOL_CAPABILITIES.filter(
    capability => settings[capability.setting],
  );
}
