import type { Root } from 'hast';
import { rewriteElements } from './hast-utils';

const EXTERNAL_HREF = /^https?:\/\//i;
const MAILTO_HREF = /^mailto:/i;

/** True for the link targets that may appear in exported HTML: `http(s):`, `mailto:` and `#fragment`. */
export function isAllowedHref(href: string): boolean {
  return EXTERNAL_HREF.test(href) || MAILTO_HREF.test(href) || href.startsWith('#');
}

/**
 * Rehype plugin for `<a>` elements: links whose `href` is not allowed by
 * {@link isAllowedHref} (e.g. `javascript:`, `data:`, relative file links) are unwrapped
 * so only their content remains; external links get `rel="noopener noreferrer"`.
 */
export function rehypeLinks(): (tree: Root) => void {
  return (tree: Root) => {
    rewriteElements(tree, (element) => {
      if (element.tagName !== 'a') return undefined;
      const href = typeof element.properties.href === 'string' ? element.properties.href.trim() : '';
      if (!isAllowedHref(href)) return element.children;
      const properties = { ...element.properties, href };
      delete properties.target;
      if (EXTERNAL_HREF.test(href)) properties.rel = ['noopener', 'noreferrer'];
      element.properties = properties;
      return undefined;
    });
  };
}
