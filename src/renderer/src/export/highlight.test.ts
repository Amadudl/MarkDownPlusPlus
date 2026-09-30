import { StreamLanguage } from '@codemirror/language';
import type { Element, ElementContent } from 'hast';
import { beforeAll, describe, expect, it } from 'vitest';
import { text, textContent } from './hast-utils';
import { CODE_LINE_CLASS, highlightCode, wrapCodeLines } from './highlight';
import { defaultParserResolver } from './languages';
import type { CodeParser } from './languages';

let parser: CodeParser;

beforeAll(async () => {
  const loaded = await defaultParserResolver('ts');
  if (loaded === null) throw new Error('TypeScript parser not available');
  parser = loaded;
});

function spans(nodes: ElementContent[]): Element[] {
  return nodes.filter((node): node is Element => node.type === 'element');
}

describe('highlightCode', () => {
  it('wraps tokens in tok-* spans and keeps the source text intact', () => {
    const source = 'const answer: number = 42; // done\n';
    const nodes = highlightCode(source, parser);
    expect(nodes.map(textContent).join('')).toBe(source);
    const byText = new Map(spans(nodes).map((span) => [textContent(span), span.properties.className]));
    expect(byText.get('const')).toEqual(['tok-keyword']);
    expect(byText.get('42')).toEqual(['tok-number']);
    expect(byText.get('// done')).toEqual(['tok-comment']);
    expect(byText.get('number')).toEqual(['tok-typeName']);
    expect(byText.get('answer')).toEqual(['tok-variableName', 'tok-definition']);
  });

  it('uses the theme token classes (functions, control keywords) like the editor', () => {
    const nodes = highlightCode('function run() { if (ok) return max(1); }', parser);
    const byText = new Map(spans(nodes).map((span) => [textContent(span), span.properties.className]));
    expect(byText.get('run')).toEqual(['tok-variableName', 'tok-definition', 'tok-function']);
    expect(byText.get('if')).toEqual(['tok-keyword', 'tok-controlKeyword']);
    expect(byText.get('max')).toEqual(['tok-variableName', 'tok-function']);
  });

  it('never interprets code as markup', () => {
    const source = 'let html = "<script>alert(1)</script>";';
    const nodes = highlightCode(source, parser);
    expect(nodes.map(textContent).join('')).toBe(source);
    expect(spans(nodes).every((span) => span.tagName === 'span')).toBe(true);
  });

  it('returns plain text when nothing is highlighted', () => {
    const plain = StreamLanguage.define({
      token(stream) {
        stream.skipToEnd();
        return null;
      },
    }).parser;
    expect(highlightCode('just text', plain)).toEqual([{ type: 'text', value: 'just text' }]);
    expect(highlightCode('', plain)).toEqual([]);
  });
});

function lineSpan(children: ElementContent[]): Element {
  return { type: 'element', tagName: 'span', properties: { className: [CODE_LINE_CLASS] }, children };
}

describe('wrapCodeLines', () => {
  it('wraps each line and splits tokens that span several lines', () => {
    const nodes = highlightCode('/* a\nb */ let x = 1;\n', parser);
    const wrapped = wrapCodeLines(nodes);
    expect(wrapped.map(textContent).join('')).toBe('/* a\nb */ let x = 1;');
    const lines = spans(wrapped);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.properties.className?.toString() === CODE_LINE_CLASS)).toBe(true);
    const [first, second] = lines;
    expect(first?.children).toEqual([
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['tok-comment'] },
        children: [text('/* a')],
      },
    ]);
    expect(spans(second?.children ?? [])[0]).toEqual({
      type: 'element',
      tagName: 'span',
      properties: { className: ['tok-comment'] },
      children: [text('b */')],
    });
  });

  it('keeps inner empty lines, drops only one trailing line break and never returns zero lines', () => {
    expect(wrapCodeLines([text('a\n\nb\n\n')])).toEqual([
      lineSpan([text('a')]),
      text('\n'),
      lineSpan([]),
      text('\n'),
      lineSpan([text('b')]),
      text('\n'),
      lineSpan([]),
    ]);
    expect(wrapCodeLines([])).toEqual([lineSpan([])]);
    expect(wrapCodeLines([text('\n')])).toEqual([lineSpan([])]);
  });

  it('ignores nodes that are neither text nor elements', () => {
    expect(wrapCodeLines([{ type: 'comment', value: 'x' }, text('y')])).toEqual([lineSpan([text('y')])]);
  });

  it('drops empty token fragments and ignores non-text span children', () => {
    const span: Element = {
      type: 'element',
      tagName: 'span',
      properties: { className: ['tok-string'] },
      children: [text('q\n'), { type: 'comment', value: 'ignored' }],
    };
    expect(wrapCodeLines([span, text('r')])).toEqual([
      lineSpan([{ ...span, children: [text('q')] }]),
      text('\n'),
      lineSpan([text('r')]),
    ]);
  });
});
