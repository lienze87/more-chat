import {SseParser} from '../src/adapters/api/sseParser';

describe('SseParser', () => {
  it('waits for a blank line before emitting an event', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":')).toEqual([]);
    expect(parser.push('1}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([
      {data: '{"a":1}', event: undefined, id: undefined},
    ]);
  });

  it('joins multiple data lines and keeps event names', () => {
    const parser = new SseParser();
    const events = parser.push('event: message\ndata: line1\ndata: line2\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message');
    expect(events[0].data).toBe('line1\nline2');
  });

  it('handles CRLF, comments and multiple events in one chunk', () => {
    const parser = new SseParser();
    const events = parser.push(
      ': keep-alive\r\nid: 7\r\ndata: a\r\n\r\ndata: b\r\n\r\n',
    );
    expect(events.map(event => event.data)).toEqual(['a', 'b']);
    expect(events[0].id).toBe('7');
  });

  it('flushes an unterminated trailing event', () => {
    const parser = new SseParser();
    expect(parser.push('data: tail')).toEqual([]);
    expect(parser.flush()).toEqual([
      {data: 'tail', event: undefined, id: undefined},
    ]);
  });

  it('supports data values without a space after the colon', () => {
    const parser = new SseParser();
    expect(parser.push('data:{"ok":true}\n\n')[0].data).toBe('{"ok":true}');
  });
});
