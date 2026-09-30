import type { Element, Root } from 'hast';
import { resolveImageSrc } from '@shared/file-url';
import { rewriteElements, text } from './hast-utils';

export interface ImageOptions {
  /** Absolute path of the document, used to resolve relative image paths. */
  readonly documentPath: string | null;
  /** Whether `http(s):` images may be referenced. */
  readonly loadRemoteImages: boolean;
}

/**
 * micromark percent-encodes backslashes in destinations, which turns a Windows path such
 * as `C:\pics\a.png` into `C:%5Cpics%5Ca.png`; restore them so the drive path is recognised.
 */
export function restoreWindowsPath(src: string): string {
  return /^[a-zA-Z]:%5C/i.test(src) ? src.replace(/%5C/gi, '\\') : src;
}

/**
 * Resolved sources that are still not exported: `blob:` URLs cannot outlive the session
 * and plain `http:` images are refused by the export (and app) CSP, which only allows `https:`.
 */
const BLOCKED_RESOLVED_SRC = /^(?:blob|http):/i;

/** Text shown for a blocked image without alt text. */
export const BLOCKED_IMAGE_FALLBACK = 'image';

function blockedImage(image: Element): Element {
  const alt = typeof image.properties.alt === 'string' ? image.properties.alt.trim() : '';
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['mpp-image-blocked'], title: 'Image not loaded' },
    children: [text(alt === '' ? BLOCKED_IMAGE_FALLBACK : alt)],
  };
}

/**
 * Rehype plugin that rewrites every `<img src>` with {@link resolveImageSrc}: local
 * paths become `mpp-file:` URLs, remote URLs are kept only when allowed. Rejected
 * images (unsafe schemes, remote when disabled, insecure `http:`, unresolvable relative
 * paths, `blob:` URLs that cannot outlive the session) are replaced by `<span class="mpp-image-blocked">`
 * containing the alt text. Accepted images get `loading="lazy"`.
 */
export function rehypeImages(options: ImageOptions): (tree: Root) => void {
  return (tree: Root) => {
    rewriteElements(tree, (element) => {
      if (element.tagName !== 'img') return undefined;
      const src = typeof element.properties.src === 'string' ? element.properties.src : '';
      const resolved = resolveImageSrc(
        restoreWindowsPath(src),
        options.documentPath,
        options.loadRemoteImages,
      );
      if (resolved === null || BLOCKED_RESOLVED_SRC.test(resolved)) return blockedImage(element);
      return {
        ...element,
        properties: { ...element.properties, src: resolved, loading: 'lazy' },
      };
    });
  };
}
