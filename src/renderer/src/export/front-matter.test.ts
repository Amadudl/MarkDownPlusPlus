import { describe, expect, it } from 'vitest';
import { frontMatterTitle, splitExportFrontMatter } from './front-matter';
import type { ExportFrontMatter } from './front-matter';

const yaml = (content: string): ExportFrontMatter => ({ format: 'yaml', content });
const toml = (content: string): ExportFrontMatter => ({ format: 'toml', content });

describe('splitExportFrontMatter', () => {
  it('splits YAML front matter off the body', () => {
    expect(splitExportFrontMatter('---\ntitle: Guide\ntags: [a]\n---\n\n# Intro\n')).toEqual({
      frontMatter: yaml('title: Guide\ntags: [a]'),
      body: '# Intro\n',
    });
  });

  it('accepts a YAML block closed by "..." and trailing whitespace on fences', () => {
    expect(splitExportFrontMatter('--- \na: 1\n...\t\nText')).toEqual({
      frontMatter: yaml('a: 1'),
      body: 'Text',
    });
  });

  it('splits TOML front matter off the body', () => {
    expect(splitExportFrontMatter('+++\ntitle = "Guide"\n+++\nText')).toEqual({
      frontMatter: toml('title = "Guide"'),
      body: 'Text',
    });
    expect(splitExportFrontMatter('+++ \na = 1\n+++\t')).toEqual({ frontMatter: toml('a = 1'), body: '' });
  });

  it.each([
    ['YAML with CRLF', '---\r\na: 1\r\nb: 2\r\n---\r\nText', yaml('a: 1\nb: 2')],
    ['YAML with CR', '---\ra: 1\r---\rText', yaml('a: 1')],
    ['TOML with CRLF', '+++\r\na = 1\r\nb = 2\r\n+++\r\nText', toml('a = 1\nb = 2')],
    ['TOML with CR', '+++\ra = 1\r+++\rText', toml('a = 1')],
  ])('handles %s line endings', (_name, markdown, frontMatter) => {
    expect(splitExportFrontMatter(markdown)).toEqual({ frontMatter, body: 'Text' });
  });

  it('handles empty front matter', () => {
    expect(splitExportFrontMatter('---\n---\nText')).toEqual({ frontMatter: yaml(''), body: 'Text' });
    expect(splitExportFrontMatter('+++\n+++\nText')).toEqual({ frontMatter: toml(''), body: 'Text' });
    expect(splitExportFrontMatter('---\n---')).toEqual({ frontMatter: yaml(''), body: '' });
  });

  it.each([
    ['empty document', ''],
    ['no front matter', '# Title\n\nText'],
    ['unclosed YAML', '---\ntitle: Guide\n\nText'],
    ['unclosed TOML', '+++\ntitle = "Guide"\n\nText'],
    ['lone TOML fence', '+++'],
    ['YAML not at the start', 'Intro\n---\na: 1\n---\n'],
    ['TOML not at the start', '\n+++\na = 1\n+++\n'],
    ['indented fence', ' ---\na: 1\n---\n'],
    ['mismatched fences', '+++\na = 1\n---\n'],
    ['byte order mark not stripped', '\uFEFF---\na: 1\n---\n'],
  ])('leaves the document untouched with %s', (_name, markdown) => {
    expect(splitExportFrontMatter(markdown)).toEqual({ frontMatter: null, body: markdown });
  });
});

describe('frontMatterTitle', () => {
  it.each([
    ['plain', 'title: My Guide', 'My Guide'],
    ['plain with comment', 'title: My Guide # draft', 'My Guide'],
    ['plain with a hash inside', 'title: C#sharp', 'C#sharp'],
    ['double-quoted with escapes', 'title: "Say \\"hi\\" \\u00e9"', 'Say "hi" é'],
    ['double-quoted with comment', 'title: "A # B" # note', 'A # B'],
    ['single-quoted', "title: 'It''s # here'", "It's # here"],
    ['padded key and value', 'title  :   Spaced   ', 'Spaced'],
    ['after other keys', 'date: 2026-01-01\nauthor: me\ntitle: Later', 'Later'],
  ])('reads a YAML %s title', (_name, content, expected) => {
    expect(frontMatterTitle(yaml(content))).toBe(expected);
  });

  it('uses the first top-level YAML title and ignores nested ones', () => {
    expect(frontMatterTitle(yaml('meta:\n  title: Nested\ntitle: Top\ntitle: Second'))).toBe('Top');
    expect(frontMatterTitle(yaml('meta:\n  title: Nested'))).toBeNull();
  });

  it.each([
    ['missing', 'author: me'],
    ['empty', 'title:'],
    ['blank', 'title:   '],
    ['empty quoted', 'title: ""'],
    ['block scalar', 'title: |\n  Multi\n  line'],
    ['folded scalar', 'title: >\n  Folded'],
    ['flow sequence', 'title: [a, b]'],
    ['flow mapping', 'title: {a: b}'],
    ['alias', 'title: *ref'],
    ['unterminated double quote', 'title: "open'],
    ['text after double quote', 'title: "a" b'],
    ['invalid escape', 'title: "\\q"'],
    ['unterminated single quote', "title: 'open"],
    ['no space after colon', 'title:x'],
    ['different key', 'subtitle: Nope'],
  ])('returns null for a YAML title that is %s', (_name, content) => {
    expect(frontMatterTitle(yaml(content))).toBeNull();
  });

  it.each([
    ['basic string', 'title = "My Guide"', 'My Guide'],
    ['basic string with comment', 'title="A # B" # note', 'A # B'],
    ['literal string', "title = 'C:\\path'", 'C:\\path'],
    ['indented key', '  title = "Indented"', 'Indented'],
    ['after other keys', 'date = 2026-01-01\ntitle = "Later"', 'Later'],
  ])('reads a TOML %s title', (_name, content, expected) => {
    expect(frontMatterTitle(toml(content))).toBe(expected);
  });

  it.each([
    ['missing', 'date = 2026-01-01'],
    ['unquoted', 'title = Guide'],
    ['a number', 'title = 42'],
    ['inside a table', 'draft = true\n[params]\ntitle = "Nested"'],
    ['blank', "title = '  '"],
    ['a YAML-style doubled quote', "title = 'It''s'"],
  ])('returns null for a TOML title that is %s', (_name, content) => {
    expect(frontMatterTitle(toml(content))).toBeNull();
  });

  it('returns null for empty front matter', () => {
    expect(frontMatterTitle(yaml(''))).toBeNull();
    expect(frontMatterTitle(toml(''))).toBeNull();
  });
});
