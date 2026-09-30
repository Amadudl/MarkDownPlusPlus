import type { Element, ElementContent, Root, RootContent, Text } from 'hast';

/**
 * What a {@link rewriteElements} visitor returns for an element:
 * - `undefined` keeps the element and descends into its children,
 * - `null` removes the element (and its subtree),
 * - a node or an array of nodes replaces the element. Replacements are not revisited.
 */
export type ElementRewrite = ElementContent | readonly ElementContent[] | null | undefined;

type ParentNode = Root | Element;

/**
 * Walks the tree depth-first in document order and lets `visitor` keep, remove or
 * replace every element. The walk is iterative per parent so replacements can change
 * the number of children safely.
 */
export function rewriteElements(parent: ParentNode, visitor: (element: Element) => ElementRewrite): void {
  const children: RootContent[] = parent.children;
  let index = 0;
  while (index < children.length) {
    const child = children[index];
    if (child?.type !== 'element') {
      index += 1;
      continue;
    }
    const result = visitor(child);
    if (result === undefined) {
      rewriteElements(child, visitor);
      index += 1;
    } else if (result === null) {
      children.splice(index, 1);
    } else {
      const replacement: readonly ElementContent[] = isNodeArray(result) ? result : [result];
      children.splice(index, 1, ...replacement);
      index += replacement.length;
    }
  }
}

function isNodeArray(value: ElementContent | readonly ElementContent[]): value is readonly ElementContent[] {
  return Array.isArray(value);
}

/** Returns every element (depth-first, document order) for which `predicate` is true. */
export function collectElements(parent: ParentNode, predicate: (element: Element) => boolean): Element[] {
  const found: Element[] = [];
  const visit = (node: ParentNode): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (predicate(child)) found.push(child);
      visit(child);
    }
  };
  visit(parent);
  return found;
}

/** Concatenated text of a node and its descendants (like DOM `textContent`). */
export function textContent(node: Root | RootContent): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'root' && node.type !== 'element') return '';
  let result = '';
  for (const child of node.children) result += textContent(child);
  return result;
}

/** The `className` property of an element as a list of strings. */
export function classList(element: Element): string[] {
  const value: unknown = element.properties.className;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/\s+/).filter((name) => name !== '');
  return [];
}

/** Adds `name` to the element's class list (no duplicates). */
export function addClass(element: Element, name: string): void {
  const classes = classList(element);
  if (!classes.includes(name)) classes.push(name);
  element.properties.className = classes;
}

/** Creates a hast text node. */
export function text(value: string): Text {
  return { type: 'text', value };
}

/** True for text nodes that contain only whitespace. */
export function isWhitespaceText(node: ElementContent): boolean {
  return node.type === 'text' && node.value.trim() === '';
}
