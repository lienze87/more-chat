import type {ServerToolCall} from '../../domain/chat/types';
import {hostOf} from '../../utils/url';

export interface ServerToolPresentation {
  title: string;
  detail?: string;
}

function actionType(call: ServerToolCall): string {
  return typeof call.action?.type === 'string' ? call.action.type : 'unknown';
}

function actionUrl(call: ServerToolCall): string | undefined {
  return typeof call.action?.url === 'string' ? call.action.url : undefined;
}

/**
 * 服务端工具卡片的标题与一行说明。
 *
 * 工具卡片和处理过程共用这份动作解释，避免 `search` / `open_page` 等类型各自
 * 维护一套判断。
 */
export function presentServerToolCall(
  call: ServerToolCall,
): ServerToolPresentation {
  const action = call.action ?? {};
  switch (actionType(call)) {
    case 'search': {
      const queries = Array.isArray(action.queries)
        ? action.queries.filter(
            (query): query is string => typeof query === 'string',
          )
        : [];
      return {
        title:
          call.kind === 'image_search' || call.kind === 'deep_image_search'
            ? '搜索图片'
            : '联网搜索',
        detail: queries.length > 0 ? queries.join(' · ') : undefined,
      };
    }
    case 'open_page':
      return {
        title: call.page?.title || '打开网页',
        detail: hostOf(actionUrl(call)),
      };
    case 'find_in_page': {
      const pattern =
        typeof action.pattern === 'string' ? action.pattern : undefined;
      return {
        title: '在网页中查找',
        detail: pattern ? `“${pattern}”` : undefined,
      };
    }
    case 'read_link':
      return {
        title: call.page?.title || '阅读链接',
        detail: hostOf(actionUrl(call)),
      };
    default:
      return {title: '网页工具'};
  }
}

/** 折叠后的工具过程摘要，例如“联网搜索 · 阅读 2 个网页”。 */
export function presentServerToolProcess(calls: ServerToolCall[]): string {
  const labels: string[] = [];
  if (calls.some(call => actionType(call) === 'search')) {
    labels.push('联网搜索');
  }

  const pages = new Set<string>();
  for (const call of calls) {
    const type = actionType(call);
    if (call.status !== 'completed') {
      continue;
    }
    if (type !== 'open_page' && type !== 'read_link') {
      continue;
    }
    const url = call.page?.url ?? actionUrl(call);
    if (typeof url === 'string' && url) {
      pages.add(url);
    }
  }
  if (pages.size > 0) {
    labels.push(`阅读 ${pages.size} 个网页`);
  }
  return labels.join(' · ') || `网页工具 · ${calls.length} 个步骤`;
}
