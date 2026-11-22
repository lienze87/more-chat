export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
}

/**
 * Incremental Server-Sent Events parser.
 *
 * Feed it arbitrary text fragments; it emits complete events only once a blank
 * line terminates them. Handles \n and \r\n line endings.
 */
export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName?: string;
  private eventId?: string;

  push(text: string): SseEvent[] {
    this.buffer += text;
    const events: SseEvent[] = [];
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      if (line === '') {
        const event = this.dispatch();
        if (event) {
          events.push(event);
        }
      } else {
        this.consumeLine(line);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
    return events;
  }

  /** Flush a trailing, non newline-terminated event. */
  flush(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer.length > 0) {
      let line = this.buffer;
      this.buffer = '';
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      if (line !== '') {
        this.consumeLine(line);
      }
    }
    const event = this.dispatch();
    if (event) {
      events.push(event);
    }
    return events;
  }

  private consumeLine(line: string): void {
    if (line.startsWith(':')) {
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    switch (field) {
      case 'data':
        this.dataLines.push(value);
        break;
      case 'event':
        this.eventName = value;
        break;
      case 'id':
        this.eventId = value;
        break;
      default:
        break;
    }
  }

  private dispatch(): SseEvent | null {
    if (this.dataLines.length === 0) {
      this.eventName = undefined;
      return null;
    }
    const event: SseEvent = {
      data: this.dataLines.join('\n'),
      event: this.eventName,
      id: this.eventId,
    };
    this.dataLines = [];
    this.eventName = undefined;
    return event;
  }
}
