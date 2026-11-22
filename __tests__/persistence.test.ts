import {createThrottledSaver} from '../src/adapters/data/persistence';

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
