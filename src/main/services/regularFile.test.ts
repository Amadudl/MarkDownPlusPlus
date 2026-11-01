import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** When set, every handle `open` returns reports this size from `stat()` (a file that grew after the check). */
const fake = vi.hoisted(() => ({ statSize: null as number | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    open: vi.fn(async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const size = fake.statSize;
      if (size === null) return handle;
      const realStat = handle.stat.bind(handle);
      return Object.assign(handle, {
        stat: async () => Object.assign(await realStat(), { size }),
      });
    }),
  };
});

const { readRegularFile } = await import('./regularFile');

const windows = process.platform === 'win32';
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-regular-file-'));
  fake.statSize = null;
});

afterEach(async () => {
  fake.statSize = null;
  await rm(dir, { recursive: true, force: true });
});

describe('readRegularFile', () => {
  it('reads a regular file with the stats of the opened handle', async () => {
    const path = join(dir, 'a.txt');
    await writeFile(path, 'hello');
    const result = await readRegularFile(path, 5);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.toString('utf8')).toBe('hello');
    expect(result.stats.size).toBe(5);
    expect(result.stats.isFile()).toBe(true);
  });

  it('reads files spanning several chunks completely', async () => {
    const path = join(dir, 'big.bin');
    const content = Buffer.alloc(200 * 1024 + 7, 0x61);
    await writeFile(path, content);
    const result = await readRegularFile(path, content.length);
    expect(result.kind === 'ok' && result.data.equals(content)).toBe(true);
  });

  it('reads empty files', async () => {
    const path = join(dir, 'empty.txt');
    await writeFile(path, '');
    const result = await readRegularFile(path, 0);
    expect(result.kind === 'ok' && result.data.length === 0).toBe(true);
  });

  it('refuses files above the limit', async () => {
    const path = join(dir, 'huge.bin');
    await writeFile(path, '');
    await truncate(path, 11);
    expect(await readRegularFile(path, 10)).toEqual({ kind: 'too-large' });
  });

  it('refuses a file that grew past the limit after the size check', async () => {
    const path = join(dir, 'grown.bin');
    await writeFile(path, Buffer.alloc(100 * 1024, 0x62));
    fake.statSize = 1;
    expect(await readRegularFile(path, 1024)).toEqual({ kind: 'too-large' });
  });

  it('reads everything of a file that grew within the limit after the size check', async () => {
    const path = join(dir, 'grown-a-bit.txt');
    await writeFile(path, 'grown');
    fake.statSize = 1;
    const result = await readRegularFile(path, 10);
    expect(result.kind === 'ok' && result.data.toString('utf8')).toBe('grown');
  });

  it('refuses folders', async () => {
    const folder = join(dir, 'folder.md');
    await mkdir(folder);
    expect(await readRegularFile(folder, 10)).toEqual({ kind: 'not-a-file' });
  });

  it.skipIf(windows)('refuses FIFOs without waiting for a writer', async () => {
    const fifo = join(dir, 'pipe.md');
    execFileSync('mkfifo', [fifo]);
    expect(await readRegularFile(fifo, 10)).toEqual({ kind: 'not-a-file' });
  });

  it('throws I/O errors such as missing files', async () => {
    await expect(readRegularFile(join(dir, 'missing.md'), 10)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
