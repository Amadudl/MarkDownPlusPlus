import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for check-then-read races: a path-based `stat` sees the
 * file as it was when it was checked (a small file), the file itself has since
 * grown beyond the limit. Code that checks with `stat(path)` and then reads with
 * `readFile(path)` reads the grown file; the services must refuse it.
 */
const checked = vi.hoisted(() => ({ paths: new Set<string>() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    stat: vi.fn(async (...args: Parameters<typeof actual.stat>) => {
      const stats = await actual.stat(...args);
      return checked.paths.has(String(args[0])) ? Object.assign(stats, { size: 3 }) : stats;
    }),
  };
});

const { MAX_IMAGE_BYTES, readLocalImage } = await import('./localImages');
const { FileService, MAX_DOCUMENT_BYTES } = await import('./fileService');
const { PathRegistry } = await import('./pathRegistry');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-file-race-'));
  checked.paths.clear();
});

afterEach(async () => {
  checked.paths.clear();
  await rm(dir, { recursive: true, force: true });
});

/** Creates a sparse file of `size` bytes whose path-based `stat` reports 3 bytes. */
async function grownFile(name: string, size: number): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, '');
  await truncate(path, size);
  checked.paths.add(path);
  return path;
}

describe('check-then-read races', () => {
  it('readLocalImage refuses an image that grew past the limit after it was checked', async () => {
    const path = await grownFile('grown.png', MAX_IMAGE_BYTES + 1);
    // Only the kind is compared: a failure must not print the 50 MB the unfixed code reads.
    expect((await readLocalImage(path)).kind).toBe('forbidden');
  });

  it('FileService.read refuses a document that grew past the limit after it was checked', async () => {
    const path = await grownFile('grown.md', MAX_DOCUMENT_BYTES + 1);
    const registry = new PathRegistry();
    registry.add(path);
    await expect(new FileService(registry).read(path)).rejects.toMatchObject({ code: 'too-large' });
  });
});
