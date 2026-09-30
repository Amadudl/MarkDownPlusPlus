import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileAtomic, writeFileAtomicSync } from './atomicWrite';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('creates a new file and leaves no temporary files behind', async () => {
    const target = join(dir, 'new.md');
    await writeFileAtomic(target, 'hello');
    expect(await readFile(target, 'utf8')).toBe('hello');
    expect(await readdir(dir)).toEqual(['new.md']);
  });

  it('replaces existing content and keeps the permission bits', async () => {
    const target = join(dir, 'doc.md');
    await writeFile(target, 'old');
    await chmod(target, 0o640);
    await writeFileAtomic(target, Buffer.from('new'));
    expect(await readFile(target, 'utf8')).toBe('new');
    expect((await stat(target)).mode & 0o777).toBe(0o640);
  });

  it('applies an explicit mode', async () => {
    const target = join(dir, 'secret.json');
    await writeFileAtomic(target, '{}', { mode: 0o600 });
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it('writes through symlinks instead of replacing them', async () => {
    const real = join(dir, 'real.md');
    const link = join(dir, 'link.md');
    await writeFile(real, 'before');
    await symlink(real, link);
    await writeFileAtomic(link, 'after');
    expect(await readFile(real, 'utf8')).toBe('after');
    expect((await stat(link)).isFile()).toBe(true);
  });

  it('fails when the folder does not exist', async () => {
    await expect(writeFileAtomic(join(dir, 'missing', 'a.md'), 'x')).rejects.toThrow();
  });

  it('writes files with other hard links in place so the links stay intact', async () => {
    const target = join(dir, 'doc.md');
    const other = join(dir, 'hardlink.md');
    await writeFile(target, 'a much longer old content');
    await link(target, other);
    const inode = (await stat(target)).ino;
    await writeFileAtomic(target, 'new');
    expect(await readFile(other, 'utf8')).toBe('new');
    expect(await readFile(target, 'utf8')).toBe('new');
    expect((await stat(target)).ino).toBe(inode);
    expect((await readdir(dir)).sort()).toEqual(['doc.md', 'hardlink.md']);
  });

  it('writes files owned by another user in place so their owner is kept', async () => {
    const target = join(dir, 'shared.md');
    await writeFile(target, 'old');
    const inode = (await stat(target)).ino;
    const own = (await stat(target)).uid;
    const getuid = vi.spyOn(process, 'getuid').mockReturnValue(own + 1);
    try {
      await writeFileAtomic(target, 'new');
    } finally {
      getuid.mockRestore();
    }
    expect(await readFile(target, 'utf8')).toBe('new');
    expect((await stat(target)).ino).toBe(inode);
  });

  it('replaces files atomically where user ids do not exist (Windows)', async () => {
    const target = join(dir, 'doc.md');
    await writeFile(target, 'old');
    const original = Object.getOwnPropertyDescriptor(process, 'getuid');
    Object.defineProperty(process, 'getuid', { value: undefined, configurable: true });
    try {
      await writeFileAtomic(target, 'new');
    } finally {
      if (original) Object.defineProperty(process, 'getuid', original);
    }
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('applies an explicit mode to a file written in place', async () => {
    const target = join(dir, 'doc.md');
    await writeFile(target, 'old');
    await link(target, join(dir, 'other.md'));
    await writeFileAtomic(target, Buffer.from('new'), { mode: 0o600 });
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it('writes in place when the folder does not allow creating the temporary file', async () => {
    const folder = join(dir, 'locked');
    await mkdir(folder);
    const target = join(folder, 'doc.md');
    await writeFile(target, 'old');
    await chmod(folder, 0o555);
    try {
      await writeFileAtomic(target, 'new');
      expect(await readFile(target, 'utf8')).toBe('new');
      expect(await readdir(folder)).toEqual(['doc.md']);
    } finally {
      await chmod(folder, 0o755);
    }
  });

  it('still fails for new files in a folder that does not allow creating files', async () => {
    const folder = join(dir, 'locked');
    await mkdir(folder);
    await chmod(folder, 0o555);
    try {
      await expect(writeFileAtomic(join(folder, 'new.md'), 'x')).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      await chmod(folder, 0o755);
    }
  });

  it('removes the temporary file when the rename fails', async () => {
    const target = join(dir, 'folder');
    // Renaming a file over a non-empty directory fails.
    await mkdir(join(target, 'child'), { recursive: true });
    await expect(writeFileAtomic(target, 'x')).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['folder']);
  });
});

describe('writeFileAtomicSync', () => {
  it('writes the file', async () => {
    const target = join(dir, 'state.json');
    writeFileAtomicSync(target, '{"a":1}');
    expect(await readFile(target, 'utf8')).toBe('{"a":1}');
    expect(await readdir(dir)).toEqual(['state.json']);
  });

  it('cleans up and rethrows when the rename fails', async () => {
    const target = join(dir, 'folder');
    await mkdir(join(target, 'child'), { recursive: true });
    expect(() => writeFileAtomicSync(target, 'x')).toThrow();
    expect(await readdir(dir)).toEqual(['folder']);
  });

  it('throws when the folder does not exist', () => {
    expect(() => writeFileAtomicSync(join(dir, 'missing', 'a.json'), 'x')).toThrow();
  });
});
