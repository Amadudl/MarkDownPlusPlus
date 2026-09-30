import type { Element, Root } from 'hast';
import { describe, expect, it } from 'vitest';
import {
  addClass,
  classList,
  collectElements,
  isWhitespaceText,
  rewriteElements,
  text,
  textContent,
} from './hast-utils';

function el(
  tagName: string,
  children: Element['children'] = [],
  properties: Element['properties'] = {},
): Element {
  return { type: 'element', tagName, properties, children };
}

/** Properties as other rehype plugins may leave them (hast types `className` as `string[]`). */
function loose(properties: Record<string, unknown>): Element['properties'] {
  return properties as Element['properties'];
}

function tree(): Root {
  return {
    type: 'root',
    children: [
      { type: 'doctype' },
      el('p', [text('a'), el('b', [text('bold')]), { type: 'comment', value: 'c' }]),
      el('div', [el('span', [text('x')]), el('i', [text('y')])]),
    ],
  };
}

describe('rewriteElements', () => {
  it('visits every element in document order when nothing is replaced', () => {
    const seen: string[] = [];
    rewriteElements(tree(), (element) => {
      seen.push(element.tagName);
      return undefined;
    });
    expect(seen).toEqual(['p', 'b', 'div', 'span', 'i']);
  });

  it('removes elements that map to null', () => {
    const root = tree();
    rewriteElements(root, (element) =>
      element.tagName === 'b' || element.tagName === 'span' ? null : undefined,
    );
    expect(textContent(root)).toBe('ay');
  });

  it('replaces elements with a node or with several nodes and does not revisit replacements', () => {
    const root = tree();
    const seen: string[] = [];
    rewriteElements(root, (element) => {
      seen.push(element.tagName);
      if (element.tagName === 'b') return el('strong', [el('b', [text('inner')])]);
      if (element.tagName === 'div') return [text('1'), el('em', [text('2')]), text('3')];
      return undefined;
    });
    expect(seen).toEqual(['p', 'b', 'div']);
    expect(textContent(root)).toBe('ainner123');
    expect(root.children).toHaveLength(5);
  });

  it('handles an empty replacement array as removal', () => {
    const root: Root = { type: 'root', children: [el('a'), el('b')] };
    rewriteElements(root, (element) => (element.tagName === 'a' ? [] : undefined));
    expect(root.children).toEqual([el('b')]);
  });
});

describe('collectElements', () => {
  it('returns matching elements depth-first', () => {
    const found = collectElements(tree(), (element) => element.tagName !== 'p');
    expect(found.map((element) => element.tagName)).toEqual(['b', 'div', 'span', 'i']);
  });
});

describe('textContent', () => {
  it('concatenates text and ignores comments and doctypes', () => {
    expect(textContent(tree())).toBe('aboldxy');
    expect(textContent({ type: 'comment', value: 'x' })).toBe('');
  });
});

describe('classList / addClass', () => {
  it('reads array, string and missing class names', () => {
    expect(classList(el('a', [], { className: ['x', 'y'] }))).toEqual(['x', 'y']);
    expect(classList(el('a', [], loose({ className: ' x  y ' })))).toEqual(['x', 'y']);
    expect(classList(el('a'))).toEqual([]);
    expect(classList(el('a', [], loose({ className: 3 })))).toEqual([]);
  });

  it('adds a class once', () => {
    const element = el('a', [], loose({ className: 'x' }));
    addClass(element, 'y');
    addClass(element, 'y');
    expect(element.properties.className).toEqual(['x', 'y']);
  });
});

describe('isWhitespaceText', () => {
  it('detects whitespace-only text nodes', () => {
    expect(isWhitespaceText(text(' \n '))).toBe(true);
    expect(isWhitespaceText(text(' a '))).toBe(false);
    expect(isWhitespaceText(el('br'))).toBe(false);
  });
});
