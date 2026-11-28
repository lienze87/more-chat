import {
  enabledServerToolCapabilities,
  SERVER_TOOL_CAPABILITIES,
} from '../src/domain/chat/capabilities';
import {DEFAULT_SETTINGS} from '../src/domain/settings/types';
import {buildChatRequest} from '../src/adapters/api/requestBuilder';
import type {Conversation} from '../src/domain/chat/types';

const conversation: Conversation = {
  id: 'c1',
  title: '测试',
  titleSource: 'fallback',
  createdAt: 1,
  updatedAt: 1,
  messages: [],
};

describe('server tool capabilities', () => {
  it('enables both server tools with default settings', () => {
    expect(enabledServerToolCapabilities(DEFAULT_SETTINGS)).toEqual([
      {type: 'deepseek_web_search', setting: 'webSearch', label: '联网搜索'},
      {type: 'deepseek_read_url', setting: 'readUrl', label: '阅读链接'},
    ]);
  });

  it('follows each setting independently and keeps catalog order', () => {
    expect(
      enabledServerToolCapabilities({
        ...DEFAULT_SETTINGS,
        webSearch: false,
      }),
    ).toEqual([
      {type: 'deepseek_read_url', setting: 'readUrl', label: '阅读链接'},
    ]);
    expect(
      enabledServerToolCapabilities({
        ...DEFAULT_SETTINGS,
        readUrl: false,
      }),
    ).toEqual([
      {type: 'deepseek_web_search', setting: 'webSearch', label: '联网搜索'},
    ]);
    expect(
      enabledServerToolCapabilities({
        ...DEFAULT_SETTINGS,
        webSearch: false,
        readUrl: false,
      }),
    ).toEqual([]);
  });

  it('derives request tools from the same catalog', () => {
    const request = buildChatRequest({
      conversation,
      settings: DEFAULT_SETTINGS,
      isFirstTurn: false,
    });

    expect(request.tools).toEqual(
      SERVER_TOOL_CAPABILITIES.map(({type}) => ({type})),
    );
  });
});
