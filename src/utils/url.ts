/**
 * 从 URL 中提取用于展示的站点名。
 *
 * 引用来源与工具卡片都需要把 `https://www.example.com/a?b=1` 收缩成
 * `example.com`，统一放在这里，避免两处各写一份正则。
 */
export function hostOf(url: string | undefined): string {
  if (!url) {
    return '';
  }
  return url
    .replace(/^[a-z]+:\/\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./, '');
}
