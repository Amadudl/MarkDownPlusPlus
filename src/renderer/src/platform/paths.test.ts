import { describe, expect, it } from 'vitest';
import { basename, dirname, isMarkdownFileName, stripExtension } from './paths';

describe('paths', () => {
  it('basename handles POSIX, Windows and trailing separators', () => {
    expect(basename('/a/b/readme.md')).toBe('readme.md');
    expect(basename('C:\\docs\\notes.md')).toBe('notes.md');
    expect(basename('/a/b/')).toBe('b');
    expect(basename('file.md')).toBe('file.md');
  });

  it('dirname handles root and relative names', () => {
    expect(dirname('/a/b/readme.md')).toBe('/a/b');
    expect(dirname('C:\\docs\\notes.md')).toBe('C:\\docs');
    expect(dirname('/readme.md')).toBe('/');
    expect(dirname('readme.md')).toBe('');
  });

  it('recognises markdown file names', () => {
    expect(isMarkdownFileName('A.MD')).toBe(true);
    expect(isMarkdownFileName('notes.markdown')).toBe(true);
    expect(isMarkdownFileName('todo.txt')).toBe(true);
    expect(isMarkdownFileName('image.png')).toBe(false);
    expect(isMarkdownFileName('.md')).toBe(false);
    expect(isMarkdownFileName('README')).toBe(false);
  });

  it('strips extensions', () => {
    expect(stripExtension('notes.md')).toBe('notes');
    expect(stripExtension('archive.tar.gz')).toBe('archive.tar');
    expect(stripExtension('.hidden')).toBe('.hidden');
    expect(stripExtension('Untitled-1')).toBe('Untitled-1');
  });
});
