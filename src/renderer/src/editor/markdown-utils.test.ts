import { describe, expect, it } from 'vitest';
import {
  countWords,
  documentStats,
  extractHeadings,
  splitFrontMatter,
  stripInlineMarkdown,
  WORDS_PER_MINUTE,
} from './markdown-utils';

describe('splitFrontMatter', () => {
  it('splits closed YAML front matter (with the blank lines after it) off the body', () => {
    const md = '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n';
    expect(splitFrontMatter(md)).toEqual({
      frontMatter: '---\ntitle: Hello\ntags: [a, b]\n---\n\n',
      body: '# Body\n',
    });
  });

  it('accepts `...` as the closing fence, CRLF line breaks and trailing spaces', () => {
    const md = '--- \r\na: 1\r\n... \r\nText';
    expect(splitFrontMatter(md)).toEqual({ frontMatter: '--- \r\na: 1\r\n... \r\n', body: 'Text' });
  });

  it('handles front matter that is the whole document, with or without a final line break', () => {
    expect(splitFrontMatter('---\na: 1\n---')).toEqual({ frontMatter: '---\na: 1\n---', body: '' });
    expect(splitFrontMatter('---\n---\n  \n')).toEqual({ frontMatter: '---\n---\n  \n', body: '' });
  });

  it('returns the whole document as body without (closed) front matter', () => {
    for (const md of ['', '# Title\n---\n', ' ---\na\n---\n', '---\nno closing fence\n', 'text']) {
      expect(splitFrontMatter(md)).toEqual({ frontMatter: '', body: md });
    }
  });

  it('always reassembles to the input', () => {
    const md = '---\nx: y\n---\n\n\nA\n\nB';
    const { frontMatter, body } = splitFrontMatter(md);
    expect(frontMatter + body).toBe(md);
  });
});

describe('extractHeadings', () => {
  it('returns an empty list for an empty document', () => {
    expect(extractHeadings('')).toEqual([]);
  });

  it('extracts ATX headings of every level with 1-based line numbers', () => {
    const md = '# One\n\n## Two\n### Three\n#### Four\n##### Five\n###### Six\n####### Seven';
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'One', line: 1 },
      { level: 2, text: 'Two', line: 3 },
      { level: 3, text: 'Three', line: 4 },
      { level: 4, text: 'Four', line: 5 },
      { level: 5, text: 'Five', line: 6 },
      { level: 6, text: 'Six', line: 7 },
    ]);
  });

  it('handles closing sequences, indentation, empty headings and CRLF', () => {
    const md = '   # Indented #\r\n# Closed ###\r\n#\r\n# C#\r\n#NoSpace\r\n    # code';
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'Indented', line: 1 },
      { level: 1, text: 'Closed', line: 2 },
      { level: 1, text: '', line: 3 },
      { level: 1, text: 'C#', line: 4 },
    ]);
  });

  it('extracts setext headings, using the first paragraph line', () => {
    const md = 'Title\n=====\n\nMulti\nline\n---\n\nText\n-\n';
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Multi line', line: 4 },
      { level: 2, text: 'Text', line: 8 },
    ]);
  });

  it('does not treat thematic breaks after blank lines or list items as setext underlines', () => {
    const md = 'Para\n\n---\n\n- item\n---\n> quote\n---\n<div>\n---\n***\n';
    expect(extractHeadings(md)).toEqual([]);
  });

  it('ignores headings inside fenced code blocks of both fence types', () => {
    const md = [
      '```md',
      '# not a heading',
      '```',
      '~~~~',
      '# still code',
      '~~~',
      '# still code (short fence does not close)',
      '~~~~~',
      '# Real',
      '````',
      '```',
      '# inside',
      '````',
      '## After',
    ].join('\n');
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'Real', line: 9 },
      { level: 2, text: 'After', line: 14 },
    ]);
  });

  it('does not open a fence for backtick info strings containing backticks', () => {
    expect(extractHeadings('``` a`b\n# Heading')).toEqual([{ level: 1, text: 'Heading', line: 2 }]);
  });

  it('keeps an unterminated fence open until the end of the document', () => {
    expect(extractHeadings('```\n# hidden\n')).toEqual([]);
  });

  it('skips YAML front matter (including its closing --- line)', () => {
    const md = '---\ntitle: x\n---\n# Heading';
    expect(extractHeadings(md)).toEqual([{ level: 1, text: 'Heading', line: 4 }]);
    expect(extractHeadings('---\ntitle: x\n...\n# H')).toEqual([{ level: 1, text: 'H', line: 4 }]);
  });

  it('treats an unterminated front matter block as normal content', () => {
    expect(extractHeadings('---\n# Heading')).toEqual([{ level: 1, text: 'Heading', line: 2 }]);
  });

  it('ignores indented code blocks but allows indented paragraph continuations', () => {
    expect(extractHeadings('    code\n---')).toEqual([]);
    expect(extractHeadings('Para\n    continued\n===')).toEqual([
      { level: 1, text: 'Para continued', line: 1 },
    ]);
  });

  it('ignores setext underlines under a paragraph that strips to nothing', () => {
    expect(extractHeadings('<b></b>\n===')).toEqual([]);
    expect(extractHeadings('[](x)\n===')).toEqual([]);
    expect(extractHeadings('**\\ **\n===').length).toBe(1);
  });

  it('ignores headings nested in list items, including indented continuation lines', () => {
    const md = '- item\n\n  # Nested\n\n# A\n\n1. one\n   # deep\n2. two\n\n# B';
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'A', line: 5 },
      { level: 1, text: 'B', line: 11 },
    ]);
  });

  it('computes list content columns for tabs, wide spacing and empty items', () => {
    expect(extractHeadings('-\tfoo\n\n\t# tab\n# out')).toEqual([{ level: 1, text: 'out', line: 4 }]);
    // Five spaces after the marker: the content column is one past the marker.
    expect(extractHeadings('-     code\n\n  # in\n# out')).toEqual([{ level: 1, text: 'out', line: 4 }]);
    expect(extractHeadings('- \n# x')).toEqual([{ level: 1, text: 'x', line: 2 }]);
  });

  it('treats lazy continuation lines as part of the list item', () => {
    expect(extractHeadings('- a\ncontinued\n===\n')).toEqual([]);
    expect(extractHeadings('- a\ncontinued\n---\n')).toEqual([]);
    expect(extractHeadings('- a\n # b')).toEqual([{ level: 1, text: 'b', line: 2 }]);
    expect(extractHeadings('- a\n\nafter\n===')).toEqual([{ level: 1, text: 'after', line: 3 }]);
  });

  it('lets only non-empty bullets and ordered items starting at 1 interrupt a paragraph', () => {
    expect(extractHeadings('Para\n2. x\n===')).toEqual([{ level: 1, text: 'Para 2. x', line: 1 }]);
    expect(extractHeadings('Para\n1. x\n===')).toEqual([]);
    expect(extractHeadings('Para\n- x\n===')).toEqual([]);
    expect(extractHeadings('Para\n*\n===')).toEqual([{ level: 1, text: 'Para *', line: 1 }]);
  });

  it('ignores heading-like lines inside HTML blocks until the block ends', () => {
    const md = '<div>\n# x\n</div>\n\n# A\n<!-- note\n# c\n-->\n# B\n<!-- one line -->\n# C';
    expect(extractHeadings(md).map((heading) => heading.text)).toEqual(['A', 'B', 'C']);
    expect(extractHeadings('<pre>\n\n# in\n</pre>\n# out').map((heading) => heading.text)).toEqual(['out']);
    expect(extractHeadings('<pre>x</pre>\n# out').map((heading) => heading.text)).toEqual(['out']);
    expect(extractHeadings('<?php\n# x\n?>\n# y').map((heading) => heading.text)).toEqual(['y']);
    expect(extractHeadings('<!DOCTYPE html>\n# y').map((heading) => heading.text)).toEqual(['y']);
    expect(extractHeadings('<![CDATA[\n# x\n]]>\n# y').map((heading) => heading.text)).toEqual(['y']);
  });

  it('treats a lone tag as an HTML block only when it does not interrupt a paragraph', () => {
    expect(extractHeadings('<span>\n# H')).toEqual([]);
    expect(extractHeadings('<a href="x" data-y>\n\n# H')).toEqual([{ level: 1, text: 'H', line: 3 }]);
    expect(extractHeadings('p\n<span>\n===')).toEqual([{ level: 1, text: 'p', line: 1 }]);
    expect(extractHeadings('- a\n<span>\n# H')).toEqual([{ level: 1, text: 'H', line: 3 }]);
  });

  it('matches the heading list of the reported outline mismatch', () => {
    const md = '- item\n\n  # Nested\n\n# A\n\n<div>\n# x\n</div>\n\n# B';
    expect(extractHeadings(md).map((heading) => heading.text)).toEqual(['A', 'B']);
  });

  it('strips inline markdown from heading text', () => {
    expect(extractHeadings('# **Bold** and *em* `code` [link](http://x) ![img](a.png)')[0]?.text).toBe(
      'Bold and em code link img',
    );
  });
});

describe('stripInlineMarkdown', () => {
  it('removes emphasis, code, strike, tags, reference links and escapes', () => {
    expect(stripInlineMarkdown('***both*** __strong__ _em_ ~~del~~ ``co`de``')).toBe(
      'both strong em del co`de',
    );
    expect(stripInlineMarkdown('<span class="x">tag</span> [ref][id] \\*literal\\*')).toBe(
      'tag ref *literal*',
    );
    expect(stripInlineMarkdown('  spaced   out  ')).toBe('spaced out');
  });
});

describe('countWords', () => {
  it('counts latin words including contractions and hyphenated words', () => {
    expect(countWords("Don't stop the well-known show")).toBe(5);
  });

  it('counts each CJK ideograph and kana as a word, and Hangul words by spacing', () => {
    expect(countWords('日本語テキスト')).toBe(7);
    expect(countWords('中文 and English')).toBe(4);
    expect(countWords('한국어 문장')).toBe(2);
  });

  it('counts numbers and accented letters (unicode aware)', () => {
    expect(countWords('Größe 42 café naïve')).toBe(4);
  });

  it('ignores markdown syntax, URLs, fences, rules and table delimiters', () => {
    const md = [
      '# Heading',
      '',
      '> quote **bold** _em_',
      '',
      '- [ ] task',
      '1. item',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '---',
      '| a | b |',
      '| --- | :-: |',
      '[text](https://example.com/path) ![alt](img.png) <https://auto.link> https://bare.example',
      '[ref]: https://example.com',
      '<div>html</div>',
    ].join('\n');
    // Heading, quote, bold, em, task, item, const, x, 1, a, b, text, alt, html
    expect(countWords(md)).toBe(14);
  });

  it('returns 0 for syntax-only documents', () => {
    expect(countWords('---\n***\n')).toBe(0);
    expect(countWords('')).toBe(0);
  });
});

describe('documentStats', () => {
  it('reports zeros (and one line) for an empty document', () => {
    expect(documentStats('')).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      lines: 1,
      readingMinutes: 0,
    });
  });

  it('counts grapheme clusters, non-space characters and lines', () => {
    const stats = documentStats('a b\r\n👍🏽 é\n');
    expect(stats.characters).toBe(8);
    expect(stats.charactersNoSpaces).toBe(4);
    expect(stats.lines).toBe(3);
    expect(stats.words).toBe(3);
    expect(stats.readingMinutes).toBe(1);
  });

  it('rounds reading time up at 230 words per minute', () => {
    expect(
      documentStats(Array.from({ length: WORDS_PER_MINUTE }, () => 'word').join(' ')).readingMinutes,
    ).toBe(1);
    expect(
      documentStats(Array.from({ length: WORDS_PER_MINUTE + 1 }, () => 'word').join(' ')).readingMinutes,
    ).toBe(2);
  });

  it('reports at least one minute for a non-empty document without words', () => {
    expect(documentStats('---').readingMinutes).toBe(1);
    expect(documentStats('   \n  ').readingMinutes).toBe(0);
  });
});
