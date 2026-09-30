import { describe, expect, it } from 'vitest';
import {
  fromMppFileUrl,
  isAbsolutePath,
  isUncOrDevicePath,
  MPP_FILE_SCHEME,
  resolveImageSrc,
  toMppFileUrl,
  uncHost,
} from './file-url';

const url = (path: string): string => `mpp-file://local/${encodeURIComponent(path)}`;

describe('isUncOrDevicePath / uncHost', () => {
  it('recognises network and device paths in both slash directions', () => {
    expect(isUncOrDevicePath('\\\\server\\share\\a.png')).toBe(true);
    expect(isUncOrDevicePath('//server/share/a.png')).toBe(true);
    expect(isUncOrDevicePath('\\\\?\\C:\\a.png')).toBe(true);
    expect(isUncOrDevicePath('/server/share/a.png')).toBe(false);
    expect(isUncOrDevicePath('C:\\a.png')).toBe(false);
  });

  it('extracts the lower-cased server of UNC paths only', () => {
    expect(uncHost('\\\\Server\\share\\a.png')).toBe('server');
    expect(uncHost('//files.example/docs/x')).toBe('files.example');
    expect(uncHost('\\\\?\\C:\\a.png')).toBeNull();
    expect(uncHost('\\\\.\\pipe\\x')).toBeNull();
    expect(uncHost('//server')).toBeNull();
    expect(uncHost('/local/a.png')).toBeNull();
  });
});

describe('isAbsolutePath', () => {
  it.each([
    ['/usr/share/a.png', true],
    ['C:\\Users\\a.png', true],
    ['d:/data/a.png', true],
    ['\\\\server\\share\\a.png', true],
    ['relative/a.png', false],
    ['./a.png', false],
    ['C:relative.png', false],
    ['', false],
  ])('%s -> %s', (path, expected) => {
    expect(isAbsolutePath(path)).toBe(expected);
  });
});

describe('toMppFileUrl / fromMppFileUrl', () => {
  it('uses the mpp-file scheme', () => {
    expect(MPP_FILE_SCHEME).toBe('mpp-file');
    expect(toMppFileUrl('/a b/c#d.png')).toBe('mpp-file://local/%2Fa%20b%2Fc%23d.png');
  });

  it('round-trips POSIX and Windows paths', () => {
    for (const path of ['/Users/me/pics/a b.png', '/tmp/ümlaut&co.svg']) {
      expect(fromMppFileUrl(toMppFileUrl(path))).toBe(path);
    }
    expect(fromMppFileUrl(toMppFileUrl('C:\\Users\\me\\a.png'))).toBe('C:/Users/me/a.png');
  });

  it('rejects relative paths when encoding', () => {
    expect(() => toMppFileUrl('images/a.png')).toThrow(/Not an absolute path/);
  });

  it('ignores query strings and fragments', () => {
    expect(fromMppFileUrl(`${url('/a/b.png')}?v=2#top`)).toBe('/a/b.png');
  });

  it.each([
    ['https://example.com/a.png'],
    ['mpp-file://other/%2Fa.png'],
    ['mpp-file://local/%E0%A4%A'],
    [url('/a/\0.png')],
    [url('relative.png')],
  ])('rejects %s', (input) => {
    expect(fromMppFileUrl(input)).toBeNull();
  });
});

describe('resolveImageSrc', () => {
  const doc = '/Users/me/notes/readme.md';

  it('rejects empty sources', () => {
    expect(resolveImageSrc('   ', doc, true)).toBeNull();
  });

  it('passes through mpp-file, data and blob URLs', () => {
    const local = url('/a.png');
    expect(resolveImageSrc(local, doc, false)).toBe(local);
    expect(resolveImageSrc('data:image/png;base64,AAAA', doc, false)).toBe('data:image/png;base64,AAAA');
    expect(resolveImageSrc('blob:mpp-app://bundle/123', doc, false)).toBe('blob:mpp-app://bundle/123');
  });

  it('honours the remote image setting', () => {
    expect(resolveImageSrc('https://example.com/a.png', doc, true)).toBe('https://example.com/a.png');
    expect(resolveImageSrc('HTTP://example.com/a.png', doc, true)).toBe('HTTP://example.com/a.png');
    expect(resolveImageSrc('https://example.com/a.png', doc, false)).toBeNull();
  });

  it('converts file URLs', () => {
    expect(resolveImageSrc('file:///Users/me/a%20b.png', doc, false)).toBe(url('/Users/me/a b.png'));
    expect(resolveImageSrc('file:///C:/pics/a.png', doc, false)).toBe(url('C:/pics/a.png'));
    expect(resolveImageSrc('file://%zz', doc, false)).toBeNull();
    expect(resolveImageSrc('file:///%E0%A4%A', doc, false)).toBeNull();
  });

  it('rejects other schemes', () => {
    expect(resolveImageSrc('javascript:alert(1)', doc, true)).toBeNull();
    expect(resolveImageSrc('data:text/html,<script>', doc, true)).toBeNull();
    expect(resolveImageSrc('ftp://example.com/a.png', doc, true)).toBeNull();
  });

  it('normalises absolute paths', () => {
    expect(resolveImageSrc('/Users/me/./pics/../a.png', doc, false)).toBe(url('/Users/me/a.png'));
    expect(resolveImageSrc('C:\\pics\\..\\a.png', null, false)).toBe(url('C:/a.png'));
  });

  it('never points images at a foreign network server (Windows NTLM leak)', () => {
    for (const src of [
      '//evil.example/share/a.png',
      '\\\\evil.example\\share\\a.png',
      'file:////evil.example/share/a.png',
      '\\\\?\\C:\\a.png',
      '\\\\.\\pipe\\x.png',
      url('//evil.example/share/a.png'),
      'mpp-file://local/%E0%A4%A',
    ]) {
      expect(resolveImageSrc(src, doc, false), src).toBeNull();
      expect(resolveImageSrc(src, null, true), src).toBeNull();
    }
    // Not even when the document itself lives on a (different) share.
    expect(resolveImageSrc('//evil/share/a.png', '\\\\files\\docs\\readme.md', false)).toBeNull();
    // Relative paths cannot climb above the share root to another server.
    expect(resolveImageSrc('../../../evil/share/a.png', '//files/docs/readme.md', false)).toBe(
      url('//files/docs/evil/share/a.png'),
    );
  });

  it('keeps images next to a document opened from a network share', () => {
    const shared = '\\\\Files\\docs\\readme.md';
    expect(resolveImageSrc('pics/a.png', shared, false)).toBe(url('//Files/docs/pics/a.png'));
    expect(resolveImageSrc('\\\\files\\docs\\b.png', shared, false)).toBe(url('//files/docs/b.png'));
    expect(resolveImageSrc(url('//files/docs/c.png'), shared, false)).toBe(url('//files/docs/c.png'));
  });

  it('resolves relative paths against the document folder', () => {
    expect(resolveImageSrc('pics/a%20b.png?raw=1', doc, false)).toBe(url('/Users/me/notes/pics/a b.png'));
    expect(resolveImageSrc('../a.png', doc, false)).toBe(url('/Users/me/a.png'));
    expect(resolveImageSrc('./a.png', 'C:\\docs\\readme.md', false)).toBe(url('C:/docs/a.png'));
  });

  it('resolves relative paths of a document in the root folder', () => {
    expect(resolveImageSrc('pics/a.png', '/readme.md', false)).toBe(url('/pics/a.png'));
  });

  it('cannot resolve relative paths of untitled documents', () => {
    expect(resolveImageSrc('a.png', null, false)).toBeNull();
  });

  it('rejects undecodable relative paths', () => {
    expect(resolveImageSrc('a%E0%A4%A.png', doc, false)).toBeNull();
  });
});
