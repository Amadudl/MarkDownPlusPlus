import { highlightTree } from '@lezer/highlight';
import type { Element, ElementContent, Text } from 'hast';
import { mppTokenHighlighter } from '@renderer/themes/token-highlighter';
import { text } from './hast-utils';
import type { CodeParser } from './languages';

/** Class of the element wrapping one source line of an exported code block. */
export const CODE_LINE_CLASS = 'mpp-code-line';

/**
 * Syntax-highlights `code` with `parser` and returns hast nodes: plain text for
 * unstyled ranges and `<span class="tok-...">` for highlighted tokens. The classes
 * come from the theme system's {@link mppTokenHighlighter}, so exported code uses
 * exactly the token colours of the editor. The text is never interpreted as HTML.
 */
export function highlightCode(code: string, parser: CodeParser): ElementContent[] {
  const tree = parser.parse(code);
  const nodes: ElementContent[] = [];
  let position = 0;
  highlightTree(tree, mppTokenHighlighter, (from, to, classes) => {
    if (from > position) nodes.push(text(code.slice(position, from)));
    nodes.push({
      type: 'element',
      tagName: 'span',
      properties: { className: classes.split(' ') },
      children: [text(code.slice(from, to))],
    });
    position = to;
  });
  if (position < code.length) nodes.push(text(code.slice(position)));
  return nodes;
}

/** A token node: a text node or a single-text `tok-*` span as produced by {@link highlightCode}. */
type TokenNode = Text | Element;

/** Splits a token at line breaks; a span crossing lines becomes one span per line. */
function splitToken(node: TokenNode): TokenNode[] {
  const value = node.type === 'text' ? node.value : textOfSpan(node);
  return value
    .split('\n')
    .map((part) =>
      node.type === 'text'
        ? text(part)
        : { ...node, properties: { ...node.properties }, children: [text(part)] },
    );
}

function textOfSpan(span: Element): string {
  return span.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
}

function isEmptyToken(node: TokenNode): boolean {
  return node.type === 'text' ? node.value === '' : textOfSpan(node) === '';
}

/**
 * Groups flat token nodes (text and single-text spans) into source lines and wraps
 * every line in `<span class="mpp-code-line">`, separated by `\n` text nodes. The
 * themes' export CSS numbers these lines when `data-mpp-code-line-numbers="true"`.
 * Exactly one trailing line break (the one remark-rehype appends) is dropped so no
 * phantom empty line is numbered; empty code still yields one (empty) line, like the editor.
 */
export function wrapCodeLines(nodes: readonly ElementContent[]): ElementContent[] {
  const lines: TokenNode[][] = [[]];
  for (const node of nodes) {
    if (node.type !== 'text' && node.type !== 'element') continue;
    splitToken(node).forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (!isEmptyToken(part)) lines[lines.length - 1]?.push(part);
    });
  }
  if (lines.length > 1 && lines[lines.length - 1]?.length === 0) lines.pop();
  const result: ElementContent[] = [];
  lines.forEach((children, index) => {
    if (index > 0) result.push(text('\n'));
    result.push({ type: 'element', tagName: 'span', properties: { className: [CODE_LINE_CLASS] }, children });
  });
  return result;
}
