import { describe, expect, it } from 'vitest';
import type { FormatCommand } from '../types';
import {
  applyFormatCommand,
  insertHorizontalRule,
  insertLink,
  insertTable,
  setHeadingLevel,
  type TextEdit,
  type TextSelection,
  toggleBlockquote,
  toggleCodeBlock,
  toggleInlineWrap,
  toggleListPrefix,
} from './formatting';

/*
 * Documents are written with selection markers: «selected» or ‸ for a caret.
 * `run` applies a transformation and renders the result the same way.
 */

function render(doc: string, edit: TextEdit): string {
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  const { from, to } = edit.selection;
  if (from === to) return `${next.slice(0, from)}‸${next.slice(from)}`;
  return `${next.slice(0, from)}«${next.slice(from, to)}»${next.slice(to)}`;
}

function parse(marked: string): { doc: string; selection: TextSelection } {
  const caret = marked.indexOf('‸');
  if (caret !== -1) return { doc: marked.replace('‸', ''), selection: { from: caret, to: caret } };
  const from = marked.indexOf('«');
  const to = marked.indexOf('»') - 1;
  return { doc: marked.replace('«', '').replace('»', ''), selection: { from, to } };
}

type Transform = (doc: string, selection: TextSelection) => TextEdit;

function run(marked: string, transform: Transform): string {
  const { doc, selection } = parse(marked);
  return render(doc, transform(doc, selection));
}

const bold: Transform = (d, s) => toggleInlineWrap(d, s, '**');
const italic: Transform = (d, s) => toggleInlineWrap(d, s, '*');
const strike: Transform = (d, s) => toggleInlineWrap(d, s, '~~');
const code: Transform = (d, s) => toggleInlineWrap(d, s, '`');

describe('toggleInlineWrap', () => {
  it('wraps a selection and keeps the text selected', () => {
    expect(run('a «word» b', bold)).toBe('a **«word»** b');
    expect(run('a «word» b', strike)).toBe('a ~~«word»~~ b');
    expect(run('a «word» b', code)).toBe('a `«word»` b');
  });

  it('keeps surrounding whitespace outside the markers', () => {
    expect(run('a« word »b', bold)).toBe('a **«word»** b');
  });

  it('unwraps a selection surrounded by the marker', () => {
    expect(run('a **«word»** b', bold)).toBe('a «word» b');
    expect(run('a *«word»* b', italic)).toBe('a «word» b');
  });

  it('unwraps a selection that includes the markers', () => {
    expect(run('a «**word**» b', bold)).toBe('a «word» b');
    expect(run('a «~~w~~» b', strike)).toBe('a «w» b');
  });

  it('distinguishes italic from bold asterisk runs', () => {
    expect(run('**«word»**', italic)).toBe('***«word»***');
    expect(run('***«word»***', italic)).toBe('**«word»**');
    expect(run('***«word»***', bold)).toBe('*«word»*');
    expect(run('*«word»*', bold)).toBe('***«word»***');
    expect(run('«**word**»', italic)).toBe('*«**word**»*');
  });

  it('inserts an empty pair at the caret and removes an empty pair', () => {
    expect(run('a ‸ b', bold)).toBe('a **‸** b');
    expect(run('a **‸** b', bold)).toBe('a ‸ b');
    expect(run('a *‸* b', italic)).toBe('a ‸ b');
    expect(run('**‸**', italic)).toBe('***‸***');
  });

  it('wraps and unwraps multi-line selections line by line, skipping blank lines', () => {
    expect(run('«one\n\n two»', bold)).toBe('«**one**\n\n **two**»');
    expect(run('«**one**\n\n**two**»', bold)).toBe('«one\n\ntwo»');
  });

  it('wraps a selection that only contains markers', () => {
    expect(run('«****»', bold)).toBe('**«****»**');
    expect(run('«*****»', bold)).toBe('**«*****»**');
  });

  it('leaves whitespace-only selections unchanged', () => {
    expect(run('a«   »b', bold)).toBe('a«   »b');
  });

  it('normalises reversed and out-of-range selections', () => {
    expect(render('word', toggleInlineWrap('word', { from: 99, to: -5 }, '**'))).toBe('**«word»**');
  });
});

describe('insertLink', () => {
  it('turns the selection into link text and selects the URL placeholder', () => {
    expect(run('see «docs» now', insertLink)).toBe('see [docs](«https://») now');
  });

  it('inserts an empty link at the caret', () => {
    expect(run('a‸', insertLink)).toBe('a[](«https://»)');
  });

  it('uses a selected URL as target and places the caret in the text', () => {
    expect(run('«https://example.com»', insertLink)).toBe('[‸](https://example.com)');
    expect(run('« mailto:me@example.com »', insertLink)).toBe('[‸](mailto:me@example.com)');
  });

  it('joins multi-line selections into one line', () => {
    expect(run('«a\nb»', insertLink)).toBe('[a b](«https://»)');
  });
});

describe('setHeadingLevel', () => {
  const heading =
    (level: 0 | 1 | 2 | 3): Transform =>
    (d, s) =>
      setHeadingLevel(d, s, level);

  it('adds a heading prefix and keeps the caret on the same text', () => {
    expect(run('Tit‸le', heading(2))).toBe('## Tit‸le');
    expect(run('‸', heading(1))).toBe('# ‸');
  });

  it('replaces an existing level', () => {
    expect(run('### Ti‸tle', heading(1))).toBe('# Ti‸tle');
  });

  it('toggles the level off when it is already applied', () => {
    expect(run('## Ti‸tle', heading(2))).toBe('Ti‸tle');
  });

  it('turns headings into paragraphs with level 0', () => {
    expect(run('#### Ti‸tle', heading(0))).toBe('Ti‸tle');
    expect(run('Plain‸', heading(0))).toBe('Plain‸');
  });

  it('handles multiple lines and preserves blank lines and quote prefixes', () => {
    expect(run('«a\n\nb»', heading(1))).toBe('«# a\n\n# b»');
    expect(run('> quo‸te', heading(3))).toBe('> ### quo‸te');
    expect(run('  in‸dented', heading(1))).toBe('# in‸dented');
  });

  it('moves a caret inside a removed prefix to the line start', () => {
    expect(run('#‸# Title', heading(0))).toBe('‸Title');
  });

  it('does not include a line when the selection ends at its start', () => {
    expect(run('«one\n»two', heading(1))).toBe('«# one»\ntwo');
  });
});

describe('toggleListPrefix', () => {
  const list =
    (kind: 'bullet' | 'ordered' | 'task'): Transform =>
    (d, s) =>
      toggleListPrefix(d, s, kind);

  it('adds bullet, ordered and task markers per line', () => {
    expect(run('«a\nb»', list('bullet'))).toBe('«- a\n- b»');
    expect(run('«a\nb»', list('ordered'))).toBe('«1. a\n2. b»');
    expect(run('«a\nb»', list('task'))).toBe('«- [ ] a\n- [ ] b»');
  });

  it('removes the markers when all lines already have the kind', () => {
    expect(run('«- a\n* b»', list('bullet'))).toBe('«a\nb»');
    expect(run('«1. a\n2) b»', list('ordered'))).toBe('«a\nb»');
    expect(run('«- [x] a\n- [ ] b»', list('task'))).toBe('«a\nb»');
  });

  it('converts between list kinds and keeps indentation', () => {
    expect(run('«- a\n  - b»', list('ordered'))).toBe('«1. a\n  2. b»');
    expect(run('«1. a»', list('task'))).toBe('«- [ ] a»');
  });

  it('skips blank lines inside a multi-line selection', () => {
    expect(run('«a\n\nb»', list('bullet'))).toBe('«- a\n\n- b»');
  });

  it('adds a marker on an empty line', () => {
    expect(run('‸', list('task'))).toBe('- [ ] ‸');
  });
});

describe('toggleBlockquote', () => {
  it('quotes every line (blank lines get a bare >)', () => {
    expect(run('«a\n\nb»', toggleBlockquote)).toBe('«> a\n>\n> b»');
  });

  it('removes one quote level when all lines are quoted', () => {
    expect(run('«> a\n>\n>> b»', toggleBlockquote)).toBe('«a\n\n> b»');
  });

  it('quotes an empty line', () => {
    expect(run('‸', toggleBlockquote)).toBe('>‸');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps the selected lines in a fence and selects the content', () => {
    expect(run('x «code» y', toggleCodeBlock)).toBe('```\n«x code y»\n```');
  });

  it('uses a longer fence when the content contains backtick runs', () => {
    expect(run('«a ``` b»', toggleCodeBlock)).toBe('````\n«a ``` b»\n````');
  });

  it('inserts an empty block with the caret inside', () => {
    expect(run('‸', toggleCodeBlock)).toBe('```\n‸\n```');
  });

  it('unwraps an exactly selected fenced block', () => {
    expect(run('«```ts\nconst a = 1;\n```»', toggleCodeBlock)).toBe('«const a = 1;»');
    expect(run('«~~~\n~~~»', toggleCodeBlock)).toBe('‸');
  });
});

describe('insertTable', () => {
  const table = [
    '| «Column 1» | Column 2 | Column 3 |',
    '| -------- | -------- | -------- |',
    '|          |          |          |',
    '|          |          |          |',
  ].join('\n');

  it('inserts into an empty document and selects the first header', () => {
    expect(run('‸', insertTable)).toBe(`${table}\n`);
  });

  it('inserts after the current line separated by blank lines', () => {
    expect(run('te‸xt\nmore', insertTable)).toBe(`text\n\n${table}\n\nmore`);
  });

  it('reuses a blank line and adds missing separation', () => {
    expect(run('a\n‸\nb', insertTable)).toBe(`a\n\n${table}\n\nb`);
    expect(run('a\n\n‸\n\nb', insertTable)).toBe(`a\n\n${table}\n\nb`);
  });
});

describe('insertHorizontalRule', () => {
  it('inserts a rule on its own paragraph so it never becomes a setext underline', () => {
    expect(run('Text‸', insertHorizontalRule)).toBe('Text\n\n---\n‸');
    expect(run('‸', insertHorizontalRule)).toBe('---\n‸');
  });

  it('keeps the caret at the end of the rule when followed by a blank line', () => {
    expect(run('a‸\n\nb', insertHorizontalRule)).toBe('a\n\n---‸\n\nb');
  });
});

describe('applyFormatCommand', () => {
  const cases: [FormatCommand, string, string][] = [
    ['bold', '«a»', '**«a»**'],
    ['italic', '«a»', '*«a»*'],
    ['strikethrough', '«a»', '~~«a»~~'],
    ['inlineCode', '«a»', '`«a»`'],
    ['link', '«a»', '[a](«https://»)'],
    ['heading1', 'a‸', '# a‸'],
    ['heading2', 'a‸', '## a‸'],
    ['heading3', 'a‸', '### a‸'],
    ['paragraph', '# a‸', 'a‸'],
    ['bulletList', 'a‸', '- a‸'],
    ['orderedList', 'a‸', '1. a‸'],
    ['taskList', 'a‸', '- [ ] a‸'],
    ['blockquote', 'a‸', '> a‸'],
    ['codeBlock', '«a»', '```\n«a»\n```'],
    ['horizontalRule', '‸', '---\n‸'],
  ];

  it.each(cases)('dispatches %s', (command, input, expected) => {
    expect(run(input, (d, s) => applyFormatCommand(d, s, command))).toBe(expected);
  });

  it('dispatches table', () => {
    expect(run('‸', (d, s) => applyFormatCommand(d, s, 'table'))).toContain('| «Column 1» |');
  });
});
