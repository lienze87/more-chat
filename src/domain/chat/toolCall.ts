import type {ClientToolCall} from './types';

/**
 * 解析客户端工具调用的 JSON 参数。
 *
 * 流式期间参数是逐字符拼出来的，可能不完整，因此解析失败返回 null 而不是抛错。
 */
export function parseToolArguments(
  call: Pick<ClientToolCall, 'argumentsText'>,
): Record<string, unknown> | null {
  const raw = call.argumentsText.trim();
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** 给 UI 用的一行参数摘要（工具卡片、错误信息）。 */
export function summarizeToolArguments(call: ClientToolCall): string {
  const parsed = parseToolArguments(call);
  return parsed ? summarizeParsedArguments(parsed) : call.argumentsText.trim();
}

/** 已解析参数的一行摘要，供只解析一次的调用方复用。 */
export function summarizeParsedArguments(
  parsed: Record<string, unknown>,
): string {
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return '';
  }
  return entries
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' · ');
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }
  return String(value);
};
