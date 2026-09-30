import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractFileArgs, fileArgToPath, PendingFileQueue } from './launch';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-launch-'));
  await writeFile(join(dir, 'a.md'), '');
  await writeFile(join(dir, 'b.txt'), '');
  await mkdir(join(dir, 'folder'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('extractFileArgs', () => {
  it('keeps existing files, resolved against the working directory', () => {
    const argv = [
      '/Applications/MarkDown++',
      'a.md',
      '--flag',
      '-psn_0_123',
      '',
      'folder',
      'missing.md',
      join(dir, 'b.txt'),
      'a.md',
    ];
    expect(extractFileArgs(argv, { cwd: dir, defaultApp: false })).toEqual([
      join(dir, 'a.md'),
      join(dir, 'b.txt'),
    ]);
  });

  it('skips the app path when running unpackaged', () => {
    const argv = ['/electron', join(dir, 'a.md'), join(dir, 'b.txt')];
    expect(extractFileArgs(argv, { cwd: dir, defaultApp: true })).toEqual([join(dir, 'b.txt')]);
  });
});

describe('file URIs from Linux desktop launchers (%U)', () => {
  it('opens file:// URIs, including percent-encoded names', async () => {
    const spaced = join(dir, 'My Notes.md');
    await writeFile(spaced, '#');
    const argv = [
      '/opt/MarkDown++/markdownplusplus',
      pathToFileURL(spaced).href,
      pathToFileURL(join(dir, 'a.md')).href,
    ];
    expect(argv[1]).toContain('My%20Notes.md');
    expect(extractFileArgs(argv, { cwd: '/elsewhere', defaultApp: false })).toEqual([
      spaced,
      join(dir, 'a.md'),
    ]);
  });

  it('accepts the scheme case-insensitively and ignores URIs that are not local files', () => {
    expect(fileArgToPath(`FILE://${pathToFileURL(join(dir, 'a.md')).pathname}`, '/x')).toBe(
      join(dir, 'a.md'),
    );
    expect(fileArgToPath('file://remote-host/share/a.md', '/x')).toBeNull();
    expect(fileArgToPath('FILE://Remote-Host/share/a.md', '/x')).toBeNull();
    expect(fileArgToPath('file://a b/x.md', '/x')).toBeNull();
    expect(fileArgToPath('file:///a%2Fb.md', '/x')).toBeNull();
    expect(
      fileArgToPath(pathToFileURL(join(dir, 'a.md')).href.replace('file://', 'file://localhost'), '/x'),
    ).toBe(join(dir, 'a.md'));
    expect(fileArgToPath('relative.md', '/base')).toBe(resolve('/base', 'relative.md'));
    const argv = ['/app', 'file://remote-host/share/a.md', pathToFileURL(join(dir, 'missing.md')).href];
    expect(extractFileArgs(argv, { cwd: dir, defaultApp: false })).toEqual([]);
  });
});

describe('PendingFileQueue', () => {
  it('queues unique paths and drains them', () => {
    const queue = new PendingFileQueue();
    queue.enqueue(['/a.md', '/b.md']);
    queue.enqueue(['/a.md', '/c.md']);
    expect(queue.size).toBe(3);
    expect(queue.take()).toEqual(['/a.md', '/b.md', '/c.md']);
    expect(queue.take()).toEqual([]);
    expect(queue.size).toBe(0);
  });
});
