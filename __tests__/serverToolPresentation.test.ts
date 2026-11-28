import type {ServerToolCall} from '../src/domain/chat/types';
import {
  presentServerToolCall,
  presentServerToolProcess,
} from '../src/ui/components/serverToolPresentation';

const call = (overrides: Partial<ServerToolCall> = {}): ServerToolCall => ({
  index: 0,
  id: 'call_1',
  type: 'deepseek_web_search',
  kind: 'search',
  action: {type: 'search'},
  ...overrides,
});

describe('presentServerToolCall', () => {
  it('presents search queries and image search separately', () => {
    expect(
      presentServerToolCall(
        call({action: {type: 'search', queries: ['天气', '温度']}}),
      ),
    ).toEqual({title: '联网搜索', detail: '天气 · 温度'});
    expect(
      presentServerToolCall(
        call({kind: 'image_search', action: {type: 'search'}}),
      ),
    ).toEqual({title: '搜索图片', detail: undefined});
  });

  it('prefers page titles and falls back to action hosts', () => {
    expect(
      presentServerToolCall(
        call({
          action: {type: 'open_page', url: 'https://www.example.com/a'},
          page: {url: 'https://www.example.com/a', title: '示例页面'},
        }),
      ),
    ).toEqual({title: '示例页面', detail: 'example.com'});
    expect(
      presentServerToolCall(
        call({
          action: {type: 'open_page', url: 'https://www.example.com/a'},
        }),
      ),
    ).toEqual({title: '打开网页', detail: 'example.com'});
  });

  it('quotes the find-in-page pattern', () => {
    expect(
      presentServerToolCall(
        call({action: {type: 'find_in_page', pattern: '价格'}}),
      ),
    ).toEqual({title: '在网页中查找', detail: '“价格”'});
  });

  it('presents read links and unknown actions', () => {
    expect(
      presentServerToolCall(
        call({
          action: {type: 'read_link', url: 'https://docs.example.com/x'},
          page: {url: 'https://docs.example.com/x', title: '文档'},
        }),
      ),
    ).toEqual({title: '文档', detail: 'docs.example.com'});
    expect(presentServerToolCall(call({action: {type: 'unknown'}}))).toEqual({
      title: '网页工具',
    });
  });
});

describe('presentServerToolProcess', () => {
  it('summarizes searches and distinct completed pages', () => {
    const calls = [
      call({action: {type: 'search', queries: ['a']}}),
      call({
        id: 'open_1',
        action: {type: 'open_page', url: 'https://a.example.com'},
        page: {url: 'https://a.example.com', title: 'A'},
        status: 'completed',
      }),
      call({
        id: 'read_1',
        action: {type: 'read_link', url: 'https://b.example.com'},
        page: {url: 'https://b.example.com', title: 'B'},
        status: 'completed',
      }),
      // 同一 URL 只计一次。
      call({
        id: 'read_2',
        action: {type: 'read_link', url: 'https://a.example.com'},
        page: {url: 'https://a.example.com', title: 'A'},
        status: 'completed',
      }),
      // 未完成的页面不计入阅读数。
      call({
        id: 'open_failed',
        action: {type: 'open_page', url: 'https://failed.example.com'},
        status: 'failed',
      }),
    ];

    expect(presentServerToolProcess(calls)).toBe('联网搜索 · 阅读 2 个网页');
  });

  it('falls back to a step count when there is nothing to summarize', () => {
    expect(presentServerToolProcess([])).toBe('网页工具 · 0 个步骤');
    expect(
      presentServerToolProcess([
        call({action: {type: 'find_in_page', pattern: 'x'}}),
        call({action: {type: 'unknown'}}),
        call({action: {type: 'unknown'}}),
      ]),
    ).toBe('网页工具 · 3 个步骤');
  });
});
