import {
  createDebouncedSaver,
  createThrottledSaver,
} from '../src/adapters/data/persistence';

describe('createThrottledSaver', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces scheduled values and persists the latest', async () => {
    const save = jest.fn(async () => undefined);
    const saver = createThrottledSaver<number>(save, 100);

    saver.schedule(1);
    saver.schedule(2);
    saver.schedule(3);
    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
  });

  it('flushes pending values immediately', async () => {
    const save = jest.fn(async () => undefined);
    const saver = createThrottledSaver<number>(save, 1000);

    saver.schedule(42);
    await saver.flush();

    expect(save).toHaveBeenCalledWith(42);
  });
});

it('keeps the debounce delay when a previous write is still running', async () => {
  jest.useFakeTimers();
  try {
    let finishFirstWrite!: () => void;
    const firstWrite = new Promise<void>(resolve => {
      finishFirstWrite = resolve;
    });
    const save = jest
      .fn((_value: number) => Promise.resolve())
      .mockReturnValueOnce(firstWrite);
    const saver = createDebouncedSaver(save, 300);

    saver.schedule(1);
    await jest.advanceTimersByTimeAsync(300);
    expect(save.mock.calls).toEqual([[1]]);

    saver.schedule(2);
    finishFirstWrite();
    await jest.advanceTimersByTimeAsync(299);
    expect(save.mock.calls).toEqual([[1]]);

    await jest.advanceTimersByTimeAsync(1);
    expect(save.mock.calls).toEqual([[1], [2]]);
  } finally {
    jest.useRealTimers();
  }
});
