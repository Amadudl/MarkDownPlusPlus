/** Escapes text for use in HTML element content and double- or single-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Serialises attributes as ` name="value"` pairs (leading space included, sorted by
 * name for deterministic output). Names that are not plain lowercase attribute names
 * and event-handler names (`on*`) are skipped.
 */
export function serializeAttributes(attributes: Readonly<Record<string, string>>): string {
  return Object.entries(attributes)
    .filter(([name]) => ATTRIBUTE_NAME.test(name) && !name.startsWith('on'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
}

/**
 * Makes CSS safe to embed in a `<style>` element: a `</style` sequence (any case)
 * would terminate the element, so its `/` is written as the CSS escape `\/`.
 */
export function escapeStyleContent(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}
