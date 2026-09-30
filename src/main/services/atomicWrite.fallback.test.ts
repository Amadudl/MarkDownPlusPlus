import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const failures = vi.hoisted(() => ({ rename: [] as string[], open: [] as string[] }));

function systemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    rename: vi.fn((from: string, to: string) => {
      const code = failures.rename.shift();
      return code === undefined ? actual.rename(from, to) : Promise.reject(systemError(code));
    }),
    open: vi.fn((path: string, flags?: string, mode?: number) => {
      const code = flags === 'wx' ? failures.open.shift() : undefined;
      return code === undefined ? actual.open(path, flags, mode) : Promise.reject(systemError(code));
    }),
  };
});

const { rename } = await import('node:fs/promises');
const { writeFileAtomic, WINDOWS_RENAME_RETRY_DELAYS_MS } = await import('./atomicWrite');

let dir: string;
let target: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-atomic-fallback-'));
  target = join(dir, 'doc.md');
  await writeFile(target, 'old content');
  failures.rename = [];
  failures.open = [];
  vi.mocked(rename).mockClear();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const noDelays = { renameRetryDelaysMs: [0, 0, 0] } as const;

describe('writeFileAtomic on Windows', () => {
  it('retries a rename refused because another program holds the file', async () => {
    failures.rename = ['EBUSY', 'EPERM'];
    await writeFileAtomic(target, 'new', { platform: 'win32', ...noDelays });
    expect(rename).toHaveBeenCalledTimes(3);
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['doc.md']);
  });

  it('writes in place when the rename keeps failing (e.g. the ReadOnly attribute of a folder entry)', async () => {
    failures.rename = ['EPERM', 'EPERM', 'EPERM', 'EPERM'];
    await writeFileAtomic(target, 'new', { platform: 'win32', ...noDelays });
    expect(rename).toHaveBeenCalledTimes(4);
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['doc.md']);
  });

  it('uses a short default back-off', () => {
    const total = WINDOWS_RENAME_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(2000);
  });
});

describe('writeFileAtomic rename failures elsewhere', () => {
  it('does not retry on POSIX but writes in place after a permission error', async () => {
    failures.rename = ['EACCES'];
    await writeFileAtomic(target, 'new', { platform: 'linux' });
    expect(rename).toHaveBeenCalledTimes(1);
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['doc.md']);
  });

  it('treats EBUSY as final outside Windows', async () => {
    failures.rename = ['EBUSY'];
    await expect(writeFileAtomic(target, 'new', { platform: 'darwin' })).rejects.toMatchObject({
      code: 'EBUSY',
    });
    expect(await readFile(target, 'utf8')).toBe('old content');
    expect(await readdir(dir)).toEqual(['doc.md']);
  });

  it('does not fall back for new files', async () => {
    const fresh = join(dir, 'fresh.md');
    failures.rename = ['EACCES'];
    await expect(writeFileAtomic(fresh, 'x', { platform: 'linux' })).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(await readdir(dir)).toEqual(['doc.md']);
  });

  it('propagates other errors creating the temporary file', async () => {
    failures.open = ['EMFILE'];
    await expect(writeFileAtomic(target, 'new', { platform: 'linux' })).rejects.toMatchObject({
      code: 'EMFILE',
    });
    expect(await readFile(target, 'utf8')).toBe('old content');
  });

  it('writes in place when EPERM prevents creating the temporary file', async () => {
    failures.open = ['EPERM'];
    await writeFileAtomic(target, 'new', { platform: 'linux' });
    expect(await readFile(target, 'utf8')).toBe('new');
  });
});
