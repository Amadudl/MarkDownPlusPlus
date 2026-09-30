import type { ElementStyle } from '@shared/theme-model';
import elementsCss from './css/elements.css?raw';
import tokenClassesCss from './css/tokens-classes.css?raw';
import { themeRootAttributes, themeToCssVariables, type ResolvedTheme } from './engine';
import { escapeCssForStyleElement } from './export-css';

/**
 * Stylesheet for an isolated element style preview: the element styles and the
 * `.tok-*` syntax classes. It is meant for a `<style>` element inside a shadow root,
 * where the `[data-mpp-*]` variant selectors only see the preview's own scope element
 * (never the document root with the active style), so each preview shows exactly its
 * own variants. Colours (`--mpp-ui-*`, `--mpp-code-*`) inherit from the active theme.
 */
export const ELEMENT_PREVIEW_CSS: string = escapeCssForStyleElement(
  [elementsCss, tokenClassesCss].join('\n\n'),
);

/** Attributes and custom properties that make a scope element render one element style. */
export interface ElementPreviewScope {
  /** `data-mpp-*` variant attributes, as set on the document root for the active theme. */
  readonly attributes: Readonly<Record<string, string>>;
  /** The `--mpp-el-*` custom properties of the style (colours inherit from the page). */
  readonly variables: Readonly<Record<string, string>>;
}

/**
 * Describes the scope element of a preview of `style` rendered with the colours of
 * the active `theme`: put the attributes and variables on an element inside a shadow
 * root that also contains {@link ELEMENT_PREVIEW_CSS} and a `.mpp-document`.
 */
export function elementPreviewScope(theme: ResolvedTheme, style: ElementStyle): ElementPreviewScope {
  const scoped: ResolvedTheme = { ...theme, elements: style };
  const variables = Object.fromEntries(
    Object.entries(themeToCssVariables(scoped)).filter(([name]) => name.startsWith('--mpp-el-')),
  );
  return { attributes: themeRootAttributes(scoped), variables };
}
