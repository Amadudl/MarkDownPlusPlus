import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exit: vi.fn(),
  start: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('electron', () => ({ app: { exit: mocks.exit } }));
vi.mock('./application', () => ({
  Application: class {
    start = mocks.start;
  },
}));

describe('main entry point', () => {
  beforeEach(() => {
    mocks.exit.mockClear();
    mocks.start.mockClear();
  });

  it('starts the application on import', async () => {
    await import('./index');
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.exit).not.toHaveBeenCalled();
  });

  it('exits with status 1 when startup fails', async () => {
    const { bootstrap } = await import('./index');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('no display');
    await bootstrap({ start: () => Promise.reject(failure) } as never);
    expect(error).toHaveBeenCalledWith('MarkDown++ failed to start:', failure);
    expect(mocks.exit).toHaveBeenCalledWith(1);
    error.mockRestore();
  });
});
