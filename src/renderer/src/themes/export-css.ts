import elementsCss from './css/elements.css?raw';
import exportPageCss from './css/export.css?raw';
import tokensCss from './css/tokens.css?raw';
import tokenClassesCss from './css/tokens-classes.css?raw';
import { themeRootAttributes, themeToCssVariables, type ResolvedTheme } from './engine';

/** Self-contained CSS for exported documents plus the attributes for the `<html>` element. */
export interface ExportCss {
  readonly css: string;
  readonly rootAttributes: Record<string, string>;
}

/**
 * Neutralises sequences that could terminate a surrounding `<style>` element or open
 * an HTML comment. Our own CSS never contains `<`; the replacement is a valid CSS
 * escape, so it cannot change the meaning of legitimate CSS.
 */
export function escapeCssForStyleElement(css: string): string {
  return css.replace(/</g, '\\3c ');
}

/** Serialises CSS variables as a `:root` block (one declaration per line). */
export function cssVariablesBlock(vars: Readonly<Record<string, string>>, colorScheme: string): string {
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n  color-scheme: ${colorScheme};\n${lines.join('\n')}\n}`;
}

/**
 * Builds the complete stylesheet of an exported HTML/PDF document: design tokens,
 * the theme's variables inlined into `:root`, all element styles, the `.tok-*`
 * syntax classes and page styles. KaTeX CSS is not included (the exporter adds it).
 * The returned `rootAttributes` must be set on `<html>` so the variant selectors match.
 */
export function buildExportCss(theme: ResolvedTheme): ExportCss {
  const css = [
    tokensCss,
    '/* Active theme */',
    cssVariablesBlock(themeToCssVariables(theme), theme.ui.kind),
    elementsCss,
    tokenClassesCss,
    exportPageCss,
  ].join('\n\n');
  return { css: escapeCssForStyleElement(css), rootAttributes: themeRootAttributes(theme) };
}
