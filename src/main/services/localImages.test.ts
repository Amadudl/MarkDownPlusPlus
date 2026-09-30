import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IMAGE_MIME_TYPES,
  imageMimeType,
  isPermittedImagePath,
  MAX_IMAGE_BYTES,
  readLocalImage,
} from './localImages';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-images-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('imageMimeType', () => {
  it('knows exactly the allowlisted image types', () => {
    expect(Object.keys(IMAGE_MIME_TYPES).sort()).toEqual(
      ['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'].sort(),
    );
    expect(imageMimeType('/a/B.PNG')).toBe('image/png');
    expect(imageMimeType('/a/b.svg')).toBe('image/svg+xml');
    expect(imageMimeType('/a/b.html')).toBeNull();
    expect(imageMimeType('/a/noext')).toBeNull();
  });
});

describe('readLocalImage', () => {
  it('reads allowlisted image files', async () => {
    const path = join(dir, 'pic.png');
    await writeFile(path, Buffer.from([1, 2, 3]));
    const result = await readLocalImage(path);
    expect(result).toEqual({ kind: 'ok', data: Buffer.from([1, 2, 3]), mimeType: 'image/png' });
  });

  it('forbids other file types even if they exist', async () => {
    const path = join(dir, 'secret.txt');
    await writeFile(path, 'secret');
    expect(await readLocalImage(path)).toEqual({ kind: 'forbidden' });
  });

  it('forbids images above the size limit', async () => {
    const path = join(dir, 'huge.jpg');
    await writeFile(path, '');
    await truncate(path, MAX_IMAGE_BYTES + 1);
    expect(await readLocalImage(path)).toEqual({ kind: 'forbidden' });
  });

  it('reports missing files and folders as not found', async () => {
    await mkdir(join(dir, 'folder.png'));
    expect(await readLocalImage(join(dir, 'folder.png'))).toEqual({ kind: 'not-found' });
    expect(await readLocalImage(join(dir, 'missing.gif'))).toEqual({ kind: 'not-found' });
  });
});

describe('isPermittedImagePath', () => {
  it('never touches network or device paths on Windows unless the server is allowed', () => {
    for (const path of [
      '//evil.example/share/a.png',
      '\\\\evil.example\\share\\a.png',
      '\\\\?\\C:\\a.png',
      '\\\\.\\pipe\\a.png',
      '//?/UNC/evil/share/a.png',
    ]) {
      expect(isPermittedImagePath(path, { platform: 'win32' }), path).toBe(false);
    }
    const allowUncHost = (host: string): boolean => host === 'fileserver';
    expect(isPermittedImagePath('\\\\FileServer\\docs\\a.png', { platform: 'win32', allowUncHost })).toBe(
      true,
    );
    expect(isPermittedImagePath('//evil/docs/a.png', { platform: 'win32', allowUncHost })).toBe(false);
    expect(isPermittedImagePath('\\\\?\\C:\\a.png', { platform: 'win32', allowUncHost: () => true })).toBe(
      false,
    );
    expect(isPermittedImagePath('C:\\pics\\a.png', { platform: 'win32' })).toBe(true);
  });

  it('allows every path elsewhere, where // is just the root folder', () => {
    expect(isPermittedImagePath('//evil.example/share/a.png', { platform: 'darwin' })).toBe(true);
    expect(isPermittedImagePath('/pics/a.png')).toBe(true);
  });

  it('makes readLocalImage refuse forbidden network paths without touching them', async () => {
    expect(await readLocalImage('//evil.example/share/a.png', { platform: 'win32' })).toEqual({
      kind: 'forbidden',
    });
  });
});
