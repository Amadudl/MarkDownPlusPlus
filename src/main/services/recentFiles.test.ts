import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECENT_FILES, RecentFiles } from './recentFiles';

/** A platform-absolute path: `/one.md` stays POSIX on macOS/Linux and becomes `D:\\one.md` on Windows. */
const abs = (path: string): string => resolve(path);

let dir: string;
let store: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-recent-'));
  store = join(dir, 'recent.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function touch(name: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, '#');
  return path;
}

describe('RecentFiles', () => {
  it('keeps the most recent file first and de-duplicates', async () => {
    let clock = 1;
    const recent = new RecentFiles(store, { platform: 'linux', now: () => clock++ });
    const a = await touch('a.md');
    const b = await touch('b.md');
    await recent.add(a);
    await recent.add(b);
    await recent.add(a);
    expect(recent.list()).toEqual([
      { path: a, openedAt: 3 },
      { path: b, openedAt: 2 },
    ]);
  });

  it('de-duplicates case-insensitively on macOS and Windows only', async () => {
    const mac = new RecentFiles(store, { platform: 'darwin' });
    await mac.add(abs('/Docs/A.md'));
    await mac.add(abs('/docs/a.md'));
    expect(mac.list().map((file) => file.path)).toEqual([abs('/docs/a.md')]);

    const linux = new RecentFiles(join(dir, 'linux.json'), { platform: 'linux' });
    await linux.add(abs('/Docs/A.md'));
    await linux.add(abs('/docs/a.md'));
    expect(linux.list()).toHaveLength(2);
  });

  it(`caps the list at ${MAX_RECENT_FILES} entries`, async () => {
    const recent = new RecentFiles(store);
    for (let index = 0; index < MAX_RECENT_FILES + 5; index += 1) await recent.add(abs(`/f${index}.md`));
    expect(recent.list()).toHaveLength(MAX_RECENT_FILES);
    expect(recent.list()[0]?.path).toBe(abs(`/f${MAX_RECENT_FILES + 4}.md`));
  });

  it('persists and reloads, dropping malformed entries', async () => {
    const recent = new RecentFiles(store, { now: () => 5 });
    await recent.add(abs('/one.md'));
    expect(JSON.parse(await readFile(store, 'utf8'))).toEqual({
      version: 1,
      files: [{ path: abs('/one.md'), openedAt: 5 }],
    });

    await writeFile(
      store,
      JSON.stringify({
        version: 1,
        files: [
          { path: abs('/one.md'), openedAt: 5 },
          { path: 'relative.md', openedAt: 1 },
          { path: abs('/two.md'), openedAt: -1 },
          'garbage',
          { path: abs('/one.md'), openedAt: 2 },
          { path: abs('/three.md'), openedAt: 1 },
        ],
      }),
    );
    const reloaded = new RecentFiles(store, { platform: 'linux' });
    expect(await reloaded.load()).toEqual([
      { path: abs('/one.md'), openedAt: 5 },
      { path: abs('/three.md'), openedAt: 1 },
    ]);
  });

  it('ignores files with the wrong shape', async () => {
    await writeFile(store, JSON.stringify({ version: 2, files: [] }));
    expect(await new RecentFiles(store).load()).toEqual([]);
  });

  it('hides entries whose file is missing on get without forgetting them', async () => {
    const recent = new RecentFiles(store);
    const kept = await touch('kept.md');
    const offline = await touch('offline.md');
    await recent.add(kept);
    await recent.add(offline);
    await recent.add(dir);
    await rm(offline);
    const listener = vi.fn();
    recent.onChange(listener);
    expect((await recent.get()).map((file) => file.path)).toEqual([kept]);
    // Nothing is persisted or announced: the file may be on a drive that is just unmounted.
    expect(listener).not.toHaveBeenCalled();
    expect(recent.list().map((file) => file.path)).toEqual([dir, offline, kept]);
    const persisted = JSON.parse(await readFile(store, 'utf8')) as { files: { path: string }[] };
    expect(persisted.files.map((file) => file.path)).toEqual([dir, offline, kept]);
    // Once the drive is back, the entry shows up again.
    await touch('offline.md');
    expect((await recent.get()).map((file) => file.path)).toEqual([offline, kept]);
  });

  it('keeps working when the list cannot be saved (read-only or full disk)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // The store's parent is a regular file, so every write fails.
    const blocker = await touch('blocker');
    const recent = new RecentFiles(join(blocker, 'recent.json'));
    const listener = vi.fn();
    recent.onChange(listener);
    try {
      await expect(recent.add(abs('/doc.md'))).resolves.toEqual([
        expect.objectContaining({ path: abs('/doc.md') }),
      ]);
      await expect(recent.clear()).resolves.toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, [expect.objectContaining({ path: abs('/doc.md') })]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not save the recent files list'));
    } finally {
      warn.mockRestore();
    }
  });

  it('integrates with the OS recent documents and clears them', async () => {
    const hooks = { addRecentDocument: vi.fn(), clearRecentDocuments: vi.fn() };
    const recent = new RecentFiles(store, { hooks });
    const listener = vi.fn();
    const unsubscribe = recent.onChange(listener);
    await recent.add(abs('/x.md'));
    expect(hooks.addRecentDocument).toHaveBeenCalledWith(abs('/x.md'));
    await recent.clear();
    expect(hooks.clearRecentDocuments).toHaveBeenCalled();
    expect(recent.list()).toEqual([]);
    expect(listener).toHaveBeenLastCalledWith([]);
    unsubscribe();
    await recent.add(abs('/y.md'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
