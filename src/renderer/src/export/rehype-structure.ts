import type { Element, ElementContent, Root } from 'hast';
import { addClass, collectElements, isWhitespaceText, rewriteElements, textContent } from './hast-utils';
import { createSlugger } from './slug';

/** Rehype plugin that wraps every `<table>` in `<div class="mpp-table-wrap">` (horizontal scrolling). */
export function rehypeTableWrap(): (tree: Root) => void {
  return (tree: Root) => {
    rewriteElements(tree, (element) => {
      if (element.tagName !== 'table') return undefined;
      return {
        type: 'element',
        tagName: 'div',
        properties: { className: ['mpp-table-wrap'] },
        children: [element],
      };
    });
  };
}

function firstMeaningfulChild(element: Element): ElementContent | undefined {
  return element.children.find((child) => !isWhitespaceText(child));
}

function asCheckbox(node: ElementContent | undefined): Element | null {
  return node?.type === 'element' && node.tagName === 'input' && node.properties.type === 'checkbox'
    ? node
    : null;
}

/** The leading checkbox of a GFM task list item (tight: `li > input`, loose: `li > p > input`). */
function taskCheckbox(item: Element): Element | null {
  const first = firstMeaningfulChild(item);
  if (first?.type === 'element' && first.tagName === 'p') return asCheckbox(firstMeaningfulChild(first));
  return asCheckbox(first);
}

/**
 * Rehype plugin for GFM task lists: list items starting with a checkbox get the
 * `task-list-item` class, their checkbox is always `disabled` (exports are read-only),
 * and any `<input>` that is not such a checkbox is removed.
 */
export function rehypeTaskLists(): (tree: Root) => void {
  return (tree: Root) => {
    const allowed = new Set<Element>();
    for (const item of collectElements(tree, (element) => element.tagName === 'li')) {
      const checkbox = taskCheckbox(item);
      if (checkbox === null) continue;
      addClass(item, 'task-list-item');
      checkbox.properties.disabled = true;
      allowed.add(checkbox);
    }
    rewriteElements(tree, (element) =>
      element.tagName === 'input' && !allowed.has(element) ? null : undefined,
    );
  };
}

const HEADING = /^h[1-6]$/;

export interface HeadingIdOptions {
  /** Ids that must not be used (e.g. DOM-clobbering names the sanitiser would strip). */
  readonly isForbiddenId?: (id: string) => boolean;
}

/**
 * Rehype plugin that gives every heading without an id a slugified, unique id so
 * `[text](#heading)` anchors work. Ids already present in the tree (footnotes) are
 * reserved first and never duplicated.
 */
export function rehypeHeadingIds(options: HeadingIdOptions = {}): (tree: Root) => void {
  return (tree: Root) => {
    const slugger = createSlugger(options.isForbiddenId);
    const all = collectElements(tree, () => true);
    for (const element of all) {
      if (typeof element.properties.id === 'string') slugger.reserve(element.properties.id);
    }
    for (const heading of all) {
      if (!HEADING.test(heading.tagName) || typeof heading.properties.id === 'string') continue;
      heading.properties.id = slugger.slug(textContent(heading));
    }
  };
}
