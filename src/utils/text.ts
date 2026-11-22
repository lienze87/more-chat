export function truncate(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

/** Rough preview for conversation rows; strips the most common markdown noise. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~>`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const diff = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return '刚刚';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }
  if (diff < 2 * day) {
    return '昨天';
  }
  if (diff < 7 * day) {
    return `${Math.floor(diff / day)} 天前`;
  }
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 消息脚注用的时间：当天只显示 HH:mm，跨天补上日期。
 *
 * 用绝对时间而不是相对时间，是因为消息会长期留在列表里，「3 天前」会随着
 * 浏览时间变化，反而看不出是哪条。
 */
const pad2 = (value: number): string => String(value).padStart(2, '0');

export function formatMessageTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const date = new Date(timestamp);
  const current = new Date(now);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const sameDay =
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth() &&
    date.getDate() === current.getDate();
  return sameDay
    ? clock
    : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

/** 1234 → "1,234"，让 token 数一眼能读出量级。 */
export function formatTokenCount(tokens: number): string {
  return String(Math.round(tokens)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 思考耗时：不足一分钟只说秒数，超过一分钟补上分钟。 */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} 分钟` : `${minutes} 分 ${seconds} 秒`;
}

export function fallbackTitle(text: string): string {
  const title = truncate(text, 24);
  return title || '新对话';
}
