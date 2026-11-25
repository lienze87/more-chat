interface Saver<T> {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
}

/** Coalesce writes within a window that starts with the first update. */
export function createThrottledSaver<T>(
  save: (value: T) => Promise<void>,
  intervalMs = 1500,
): Saver<T> {
  return createSaver(save, intervalMs, 'throttle');
}

/** Coalesce writes until there have been no updates for the delay. */
export function createDebouncedSaver<T>(
  save: (value: T) => Promise<void>,
  delayMs: number,
): Saver<T> {
  return createSaver(save, delayMs, 'debounce');
}

function createSaver<T>(
  save: (value: T) => Promise<void>,
  intervalMs: number,
  mode: 'throttle' | 'debounce',
): Saver<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const drain = async (): Promise<void> => {
    if (running) {
      return running;
    }
    running = (async () => {
      while (pending !== null) {
        if (mode === 'debounce' && timer !== null) {
          break;
        }
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
      if (timer !== null) {
        if (mode === 'throttle') {
          return;
        }
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        drain().catch(() => undefined);
      }, intervalMs);
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await drain();
    },
  };
}
