import { mkdtemp, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChangedEvent } from '../../shared/types';
import { FileWatcher } from './fileWatcher';

let dir: string;
let events: { owner: number; event: FileChangedEvent }[];
let watcher: FileWatcher;

const settle = (ms = 250): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-watch-'));
  events = [];
  watcher = new FileWatcher({
    emit: (owner, event) => events.push({ owner, event }),
    debounceMs: 30,
    pollMs: 40,
  });
});

afterEach(async () => {
  watcher.dispose();
  await rm(dir, { recursive: true, force: true });
});

async function bumpMtime(path: string, content: string, secondsAhead: number): Promise<number> {
  await writeFile(path, content);
  const when = new Date(Date.now() + secondsAhead * 1000);
  await utimes(path, when, when);
  return (await stat(path)).mtimeMs;
}

describe('FileWatcher', () => {
  it('reports external changes once per burst to every owner', async () => {
    const path = join(dir, 'doc.md');
    await writeFile(path, 'v1');
    await watcher.watch(1, path);
    await watcher.watch(2, path);
    await watcher.watch(2, path);
    const mtime = await bumpMtime(path, 'v2', 10);
    await vi.waitFor(() => expect(events).toHaveLength(2), { timeout: 3000 });
    expect(events).toEqual([
      { owner: 1, event: { path, kind: 'changed', mtimeMs: mtime } },
      { owner: 2, event: { path, kind: 'changed', mtimeMs: mtime } },
    ]);
  });

  it('ignores changes produced by our own saves', async () => {
    const path = join(dir, 'doc.md');
    await writeFile(path, 'v1');
    await watcher.watch(1, path);
    const when = new Date(Date.now() + 20_000);
    watcher.recordOwnWrite(path, Math.floor(when.getTime() / 1000) * 1000);
    await writeFile(path, 'v2');
    await utimes(path, Math.floor(when.getTime() / 1000), Math.floor(when.getTime() / 1000));
    watcher.recordOwnWrite(path, (await stat(path)).mtimeMs);
    await settle();
    expect(events).toEqual([]);
    watcher.recordOwnWrite(join(dir, 'unwatched.md'), 1);
  });

  it('reports deletion, then re-creation, and follows replace-by-rename saves', async () => {
    const path = join(dir, 'doc.md');
    await writeFile(path, 'v1');
    await watcher.watch(7, path);
    await rm(path);
    await vi.waitFor(() => expect(events.at(-1)?.event).toEqual({ path, kind: 'deleted', mtimeMs: 0 }), {
      timeout: 3000,
    });

    const recreated = await bumpMtime(path, 'v2', 30);
    await vi.waitFor(
      () => expect(events.at(-1)?.event).toEqual({ path, kind: 'changed', mtimeMs: recreated }),
      {
        timeout: 3000,
      },
    );

    const temp = join(dir, 'doc.md.tmp');
    const replaced = await bumpMtime(temp, 'v3', 60);
    await rename(temp, path);
    await vi.waitFor(
      () => expect(events.at(-1)?.event).toEqual({ path, kind: 'changed', mtimeMs: replaced }),
      {
        timeout: 3000,
      },
    );
  });

  it('starts polling for files that do not exist yet', async () => {
    const path = join(dir, 'later.md');
    await watcher.watch(3, path);
    expect(watcher.isWatching(path)).toBe(true);
    const mtime = await bumpMtime(path, 'hello', 5);
    await vi.waitFor(
      () => expect(events).toEqual([{ owner: 3, event: { path, kind: 'changed', mtimeMs: mtime } }]),
      {
        timeout: 3000,
      },
    );
  });

  it('stops when the last owner unwatches', async () => {
    const path = join(dir, 'doc.md');
    await writeFile(path, 'v1');
    await watcher.watch(1, path);
    await watcher.watch(2, path);
    watcher.unwatch(1, path);
    expect(watcher.isWatching(path)).toBe(true);
    watcher.unwatchOwner(2);
    expect(watcher.isWatching(path)).toBe(false);
    watcher.unwatch(2, path);
    await bumpMtime(path, 'v2', 10);
    await settle();
    expect(events).toEqual([]);
  });

  it('handles an unwatch that races with the initial stat', async () => {
    const path = join(dir, 'doc.md');
    await writeFile(path, 'v1');
    const pending = watcher.watch(1, path);
    watcher.unwatch(1, path);
    await pending;
    expect(watcher.isWatching(path)).toBe(false);
  });

  it('drops pending checks of disposed watches', async () => {
    const path = join(dir, 'doc.md');
    await writeFile(path, 'v1');
    await watcher.watch(1, path);
    await bumpMtime(path, 'v2', 10);
    watcher.dispose();
    await settle();
    expect(events).toEqual([]);
  });
});
