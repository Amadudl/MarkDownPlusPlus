import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeDocument as decodeOrNull,
  encodeDocument,
  hasUtf16Bom,
  FileAccessError,
  FileService,
  isMarkdownPath,
  MAX_DOCUMENT_BYTES,
} from './fileService';
import { PathRegistry } from './pathRegistry';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
let dir: string;

function decodeDocument(bytes: Uint8Array) {
  const decoded = decodeOrNull(bytes);
  if (decoded === null) throw new Error('expected valid UTF-8');
  return decoded;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-files-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isMarkdownPath', () => {
  it.each([
    ['a.md', true],
    ['A.MARKDOWN', true],
    ['x.mdown', true],
    ['x.mkd', true],
    ['x.mkdn', true],
    ['x.mdwn', true],
    ['x.mdx', true],
    ['notes.txt', true],
    ['script.js', false],
    ['README', false],
  ])('%s -> %s', (path, expected) => {
    expect(isMarkdownPath(path)).toBe(expected);
  });
});

describe('decodeDocument / encodeDocument', () => {
  it('detects LF files', () => {
    expect(decodeDocument(Buffer.from('a\nb\n'))).toEqual({
      content: 'a\nb\n',
      lineEnding: 'lf',
      hasBom: false,
    });
  });

  it('detects CRLF files and normalises them', () => {
    expect(decodeDocument(Buffer.from('a\r\nb\r\n'))).toEqual({
      content: 'a\nb\n',
      lineEnding: 'crlf',
      hasBom: false,
    });
  });

  it('uses the dominant line ending of mixed files', () => {
    expect(decodeDocument(Buffer.from('a\r\nb\nc\n')).lineEnding).toBe('lf');
    expect(decodeDocument(Buffer.from('a\r\nb\r\nc\n')).lineEnding).toBe('crlf');
    expect(decodeDocument(Buffer.from('a\r\nb\n')).lineEnding).toBe('crlf');
  });

  it('normalises old Mac line endings and handles files without newlines', () => {
    expect(decodeDocument(Buffer.from('a\rb'))).toEqual({ content: 'a\nb', lineEnding: 'lf', hasBom: false });
    expect(decodeDocument(Buffer.from('single line')).lineEnding).toBe('lf');
  });

  it('strips a UTF-8 BOM', () => {
    const decoded = decodeDocument(Buffer.concat([BOM, Buffer.from('# Hi ✓\r\n')]));
    expect(decoded).toEqual({ content: '# Hi ✓\n', lineEnding: 'crlf', hasBom: true });
  });

  it('accepts plain Uint8Array views', () => {
    const bytes = new Uint8Array([0, 0x61, 0x0a, 0]).subarray(1, 3);
    expect(decodeDocument(bytes).content).toBe('a\n');
  });

  it('encodes line endings and BOM', () => {
    expect(encodeDocument('a\nb', 'lf', false).toString()).toBe('a\nb');
    expect(encodeDocument('a\nb', 'crlf', false).toString()).toBe('a\r\nb');
    expect(encodeDocument('a\r\nb\rc', 'crlf', false).toString()).toBe('a\r\nb\r\nc');
    const withBom = encodeDocument('x', 'lf', true);
    expect(withBom.subarray(0, 3).equals(BOM)).toBe(true);
    expect(withBom.subarray(3).toString()).toBe('x');
  });

  it('rejects bytes that are not valid UTF-8 instead of replacing them', () => {
    // "Grüße" in Windows-1252 / Latin-1.
    expect(decodeOrNull(Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65]))).toBeNull();
    expect(decodeOrNull(Buffer.concat([BOM, Buffer.from([0x48, 0xe4, 0x6c])]))).toBeNull();
    // A lone continuation byte and a truncated sequence at the end.
    expect(decodeOrNull(Buffer.from([0x61, 0x80]))).toBeNull();
    expect(decodeOrNull(Buffer.from([0x61, 0xe2, 0x82]))).toBeNull();
    expect(decodeDocument(Buffer.from('Grüße €\n')).content).toBe('Grüße €\n');
  });

  it('keeps a second BOM-like sequence after the BOM as content', () => {
    const decoded = decodeDocument(Buffer.concat([BOM, BOM, Buffer.from('x')]));
    expect(decoded).toEqual({ content: '\ufeffx', lineEnding: 'lf', hasBom: true });
  });

  it('detects UTF-16 byte-order marks', () => {
    expect(hasUtf16Bom(Buffer.from([0xff, 0xfe, 0x61, 0x00]))).toBe(true);
    expect(hasUtf16Bom(Buffer.from([0xfe, 0xff, 0x00, 0x61]))).toBe(true);
    expect(hasUtf16Bom(Buffer.from([0xff]))).toBe(false);
    expect(hasUtf16Bom(Buffer.from('ab'))).toBe(false);
    expect(hasUtf16Bom(new Uint8Array([0x61, 0xff, 0xfe]).subarray(1))).toBe(true);
  });

  it('round-trips', () => {
    const original = Buffer.concat([BOM, Buffer.from('line 1\r\nline 2\r\n')]);
    const decoded = decodeDocument(original);
    expect(encodeDocument(decoded.content, decoded.lineEnding, decoded.hasBom).equals(original)).toBe(true);
  });
});

describe('FileService', () => {
  it('reads granted files', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const path = join(dir, 'doc.md');
    await writeFile(path, Buffer.concat([BOM, Buffer.from('# Title\r\n')]));
    registry.add(path);
    const result = await service.read(path);
    expect(result).toMatchObject({ path, content: '# Title\n', lineEnding: 'crlf', hasBom: true });
    expect(result.mtimeMs).toBe((await stat(path)).mtimeMs);
  });

  it('refuses every file that was not granted, markdown or not', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const markdown = join(dir, 'CLAUDE.md');
    const yaml = join(dir, 'config.yaml');
    await writeFile(markdown, '# Instructions\n');
    await writeFile(yaml, 'a: 1\n');
    await expect(service.read(markdown)).rejects.toMatchObject({ code: 'not-allowed' });
    await expect(service.read(yaml)).rejects.toMatchObject({ code: 'not-allowed' });
    // A refused read grants nothing, so the file cannot be written afterwards either.
    expect(registry.has(markdown)).toBe(false);
    await expect(
      service.save({ path: markdown, content: 'owned', lineEnding: 'lf', hasBom: false }),
    ).rejects.toMatchObject({ code: 'not-allowed' });
    expect(await readFile(markdown, 'utf8')).toBe('# Instructions\n');
    registry.add(yaml);
    await expect(service.read(yaml)).resolves.toMatchObject({ content: 'a: 1\n' });
  });

  it('refuses non-UTF-8 and UTF-16 files so saving cannot corrupt them', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const latin1 = join(dir, 'latin1.md');
    const utf16 = join(dir, 'utf16.md');
    await writeFile(latin1, Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65, 0x0a]));
    await writeFile(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# Hi\n', 'utf16le')]));
    registry.add(latin1);
    registry.add(utf16);
    await expect(service.read(latin1)).rejects.toMatchObject({ code: 'not-utf8' });
    await expect(service.read(utf16)).rejects.toMatchObject({ code: 'unsupported-encoding' });
  });

  it('refuses folders, binaries and oversized files', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const grant = (path: string): string => {
      registry.add(path);
      return path;
    };
    const folder = grant(join(dir, 'folder.md'));
    await mkdir(folder);
    await expect(service.read(folder)).rejects.toMatchObject({ code: 'not-a-file' });

    const binary = grant(join(dir, 'binary.md'));
    await writeFile(binary, Buffer.from([0x61, 0x00, 0x62]));
    await expect(service.read(binary)).rejects.toMatchObject({ code: 'binary' });

    const huge = grant(join(dir, 'huge.md'));
    await writeFile(huge, '');
    await truncate(huge, MAX_DOCUMENT_BYTES + 1);
    await expect(service.read(huge)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('propagates I/O errors for missing files', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const missing = join(dir, 'missing.md');
    registry.add(missing);
    await expect(service.read(missing)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('saves granted files with their line ending and BOM, reporting the new mtime', async () => {
    const onSaved = vi.fn();
    const registry = new PathRegistry();
    const service = new FileService(registry, { onSaved });
    const path = join(dir, 'doc.md');
    await writeFile(path, 'old');
    registry.add(path);
    const result = await service.save({ path, content: 'a\nb\n', lineEnding: 'crlf', hasBom: true });
    const bytes = await readFile(path);
    expect(bytes.equals(Buffer.concat([BOM, Buffer.from('a\r\nb\r\n')]))).toBe(true);
    expect(result).toEqual({ path, mtimeMs: (await stat(path)).mtimeMs });
    expect(onSaved).toHaveBeenCalledWith(path, result.mtimeMs);
  });

  it('refuses to save paths that were not granted', async () => {
    const service = new FileService(new PathRegistry());
    const path = join(dir, 'other.md');
    await expect(
      service.save({ path, content: 'x', lineEnding: 'lf', hasBom: false }),
    ).rejects.toBeInstanceOf(FileAccessError);
    await expect(stat(path)).rejects.toThrow();
  });

  it('refuses to overwrite a write-protected file', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const path = join(dir, 'protected.md');
    await writeFile(path, 'keep me');
    await chmod(path, 0o444);
    registry.add(path);
    await expect(
      service.save({ path, content: 'new', lineEnding: 'lf', hasBom: false }),
    ).rejects.toMatchObject({ code: 'read-only' });
    expect(await readFile(path, 'utf8')).toBe('keep me');
    expect((await stat(path)).mode & 0o777).toBe(0o444);
  });

  it('propagates unexpected errors of the writability check', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const file = join(dir, 'plain.txt');
    await writeFile(file, 'x');
    // A path "through" a regular file fails with ENOTDIR (Windows reports ENOENT).
    const path = join(file, 'child.md');
    registry.add(path);
    await expect(service.save({ path, content: 'x', lineEnding: 'lf', hasBom: false })).rejects.toMatchObject(
      {
        code: process.platform === 'win32' ? 'ENOENT' : 'ENOTDIR',
      },
    );
  });

  it('saves through a symlink to the linked file', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const real = join(dir, 'real.md');
    const link = join(dir, 'link.md');
    await writeFile(real, 'old');
    await symlink(real, link);
    registry.add(link);
    await service.save({ path: link, content: 'new', lineEnding: 'lf', hasBom: false });
    expect(await readFile(real, 'utf8')).toBe('new');
  });

  it('refuses to save documents above the size limit', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const path = join(dir, 'big.md');
    registry.add(path);
    const content = 'x'.repeat(MAX_DOCUMENT_BYTES);
    await expect(service.save({ path, content, lineEnding: 'lf', hasBom: true })).rejects.toMatchObject({
      code: 'too-large',
    });
  });

  it('grants and writes the target of Save As', async () => {
    const registry = new PathRegistry();
    const service = new FileService(registry);
    const path = join(dir, 'new.md');
    await service.saveAs(path, { content: '# New\n', lineEnding: 'lf', hasBom: false });
    expect(await readFile(path, 'utf8')).toBe('# New\n');
    expect(registry.has(path)).toBe(true);
  });

  it('describes every refusal', () => {
    for (const code of [
      'not-allowed',
      'not-a-file',
      'too-large',
      'binary',
      'not-utf8',
      'unsupported-encoding',
      'read-only',
    ] as const) {
      const error = new FileAccessError(code, '/x.md');
      expect(error.name).toBe('FileAccessError');
      expect(error.message).toContain('/x.md');
    }
  });
});
