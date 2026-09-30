import DOMPurify from 'dompurify';
import type { Config, DOMPurify as DOMPurifyInstance } from 'dompurify';

/** Container classes of KaTeX output; only elements inside them may carry inline styles or SVG. */
const KATEX_SCOPE = '.katex, .katex-display, .katex-error';

/**
 * Inline styles emitted by KaTeX are simple length/colour declarations. Anything that
 * could fetch resources or run code (`url(`, `expression(`, `@import`, escapes, quotes)
 * is rejected.
 */
const SAFE_STYLE = /^[-\w\s:;.,#%()]*$/;
const UNSAFE_STYLE = /url\s*\(|expression|image|var\s*\(|@import|behavio/i;

/** `href` values that survive: web links, e-mail and in-document anchors. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|#)/i;
/**
 * `src` values that survive (images only): `https:`, local `mpp-file:` and raster/SVG
 * data URIs — exactly what the export CSP's `img-src` permits (plain `http:` is blocked
 * there, as in the app).
 */
const SAFE_SRC = /^(?:https:\/\/|mpp-file:\/\/|data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,])/i;

/**
 * DOMPurify URI check applied to every non "URI-safe" attribute: the schemes we emit
 * (`http(s)`, `mailto`, `mpp-file`), fragments and scheme-less values (plain attribute
 * values such as `viewBox` numbers or `data-language` names). `data:` URIs are only
 * accepted by DOMPurify on `<img>` through its separate data-URI rule, and `href`/`src`
 * are additionally restricted by {@link SAFE_HREF}/{@link SAFE_SRC} in a hook.
 */
export const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|mpp-file):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/** Strict sanitiser configuration for exported markdown fragments. */
export const SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_TAGS: ['semantics', 'annotation'],
  ADD_ATTR: [
    'encoding',
    'loading',
    'data-language',
    'data-footnotes',
    'data-footnote-ref',
    'data-footnote-backref',
  ],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP,
  FORBID_TAGS: [
    'style',
    'script',
    'iframe',
    'frame',
    'object',
    'embed',
    'form',
    'button',
    'textarea',
    'select',
    'option',
    'link',
    'meta',
    'base',
    'foreignObject',
    'use',
    'image',
    'animate',
    'set',
  ],
  FORBID_ATTR: ['srcset', 'action', 'formaction', 'target', 'xlink:href', 'ping', 'background'],
};

function isInsideKatex(node: Element): boolean {
  return node.closest(KATEX_SCOPE) !== null;
}

/** True for inline style values KaTeX produces and nothing more dangerous. */
export function isSafeKatexStyle(value: string): boolean {
  return SAFE_STYLE.test(value) && !UNSAFE_STYLE.test(value);
}

function createPurifier(): DOMPurifyInstance {
  const purifier = DOMPurify(window);
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (!(node instanceof Element)) return;
    if (data.tagName === 'svg' && !isInsideKatex(node)) node.remove();
  });
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    const value = data.attrValue.trim();
    if (data.attrName === 'style') data.keepAttr = isInsideKatex(node) && isSafeKatexStyle(value);
    else if (data.attrName === 'href') data.keepAttr = SAFE_HREF.test(value);
    else if (data.attrName === 'src') data.keepAttr = node.tagName === 'IMG' && SAFE_SRC.test(value);
  });
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'INPUT') return;
    if (node.getAttribute('type') === 'checkbox') node.setAttribute('disabled', '');
    else node.remove();
  });
  return purifier;
}

let purifier: DOMPurifyInstance | null = null;

/**
 * Sanitises an HTML fragment produced by the export pipeline with a dedicated
 * DOMPurify instance (hooks never leak into other users of DOMPurify). Scripts,
 * event handlers, forms, frames, raw styles, unsafe URLs and SVG outside KaTeX are
 * removed; inline styles survive only inside KaTeX output.
 */
export function sanitizeFragment(html: string): string {
  purifier ??= createPurifier();
  return purifier.sanitize(html, SANITIZE_CONFIG);
}
