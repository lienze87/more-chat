/**
 * Throttled saver used for chat history.
 *
 * Streaming produces many store updates per second; writing every one to
 * AsyncStorage would be wasteful. This scheduler coalesces updates and always
 * persists the latest value within `intervalMs`.
 */
export interface ThrottledSaver<T> {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
}

export function createThrottledSaver<T>(
  save: (value: T) => Promise<void>,
  intervalMs = 1500,
): ThrottledSaver<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const drain = async (): Promise<void> => {
    if (running) {
      return running;
    }
    running = (async () => {
      while (pending !== null) {
        const value = pending;
        pending = null;
        await save(value);
      }
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  };

  return {
    schedule(value: T) {
      pending = value;
      if (timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        drain().catch(() => undefined);
      }, intervalMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await drain();
    },
  };
}
