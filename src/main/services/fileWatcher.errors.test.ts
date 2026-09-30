import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as NodeFs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsWatch = vi.hoisted(() => vi.fn());
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFs>()),
  watch: fsWatch,
}));

const { FileWatcher } = await import('./fileWatcher');

class FakeFsWatcher extends EventEmitter {
  close = vi.fn();
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-watch-err-'));
  fsWatch.mockReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FileWatcher error handling', () => {
  it('re-arms after a native watcher error', async () => {
    const created: FakeFsWatcher[] = [];
    fsWatch.mockImplementation(() => {
      const fake = new FakeFsWatcher();
      created.push(fake);
      return fake;
    });
    const path = join(dir, 'doc.md');
    await writeFile(path, 'x');
    const watcher = new FileWatcher({ emit: vi.fn(), debounceMs: 5 });
    await watcher.watch(1, path);
    expect(created).toHaveLength(1);
    created[0]?.emit('error', new Error('EPERM'));
    expect(created[0]?.close).toHaveBeenCalled();
    await vi.waitFor(() => expect(created).toHaveLength(2));
    watcher.dispose();
  });

  it('falls back to polling when watching is impossible', async () => {
    fsWatch.mockImplementation(() => {
      throw new Error('ENOSPC');
    });
    const path = join(dir, 'doc.md');
    await writeFile(path, 'x');
    const emit = vi.fn();
    const watcher = new FileWatcher({ emit, pollMs: 10 });
    await watcher.watch(1, path);
    expect(watcher.isWatching(path)).toBe(true);
    await rm(path);
    await new Promise((resolve) => setTimeout(resolve, 50));
    watcher.dispose();
    expect(fsWatch).toHaveBeenCalled();
  });

  it('uses default timings', async () => {
    fsWatch.mockImplementation(() => new FakeFsWatcher());
    const path = join(dir, 'doc.md');
    await writeFile(path, 'x');
    const watcher = new FileWatcher({ emit: vi.fn() });
    await watcher.watch(1, path);
    const callback = fsWatch.mock.calls[0]?.[2] as () => void;
    callback();
    callback();
    watcher.dispose();
    expect(watcher.isWatching(path)).toBe(false);
  });
});
