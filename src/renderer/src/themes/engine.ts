import type { Settings } from '@shared/settings';
import type { CodeTheme, ElementStyle, ThemeKind, UiTheme } from '@shared/theme-model';
import { autoCodeThemeId } from './presets/code-pairing';
import { BUILTIN_CODE_THEMES, DEFAULT_CODE_THEME_BY_KIND } from './presets/code-themes';
import { BUILTIN_ELEMENT_STYLES, DEFAULT_ELEMENT_STYLE } from './presets/element-styles';
import { BUILTIN_UI_THEMES, DEFAULT_DARK_UI_THEME, DEFAULT_LIGHT_UI_THEME } from './presets/ui-themes';

/** The active trio of theme layers after resolving the settings. */
export interface ResolvedTheme {
  readonly ui: UiTheme;
  readonly code: CodeTheme;
  readonly elements: ElementStyle;
}

/** Value of the code theme setting that pairs the code theme with the UI theme. */
export const AUTO_CODE_THEME = 'auto';

interface Identified {
  readonly id: string;
}

/**
 * Built-ins first, then custom entries. Custom entries can never shadow a
 * built-in (or an earlier custom entry) with the same id, so an imported file
 * cannot silently replace a preset.
 */
function mergeById<T extends Identified>(builtins: readonly T[], custom: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of [...builtins, ...custom]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

/** Every selectable UI theme: built-ins followed by `settings.appearance.customUiThemes`. */
export function listUiThemes(settings: Settings): UiTheme[] {
  return mergeById(BUILTIN_UI_THEMES, settings.appearance.customUiThemes);
}

/** Every selectable code theme: built-ins followed by `settings.rendering.customCodeThemes`. */
export function listCodeThemes(settings: Settings): CodeTheme[] {
  return mergeById(BUILTIN_CODE_THEMES, settings.rendering.customCodeThemes);
}

/** Every selectable element style: built-ins followed by `settings.rendering.customElementStyles`. */
export function listElementStyles(settings: Settings): ElementStyle[] {
  return mergeById(BUILTIN_ELEMENT_STYLES, settings.rendering.customElementStyles);
}

function findById<T extends Identified>(items: readonly T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

/**
 * Resolves the active UI theme, code theme and element style.
 *
 * - With `appearance.followSystem` the light or dark theme is picked by `prefersDark`,
 *   otherwise `appearance.uiTheme` is used.
 * - A code theme of `'auto'` pairs a matching code theme with the UI theme.
 * - Unknown ids never fail: they fall back to the defaults (Midnight or Daylight
 *   depending on `prefersDark`, the auto-paired code theme and the Modern element style).
 */
export function resolveTheme(settings: Settings, prefersDark: boolean): ResolvedTheme {
  const { appearance, rendering } = settings;
  const uiThemes = listUiThemes(settings);
  const systemId = prefersDark ? appearance.darkTheme : appearance.lightTheme;
  const uiId = appearance.followSystem ? systemId : appearance.uiTheme;
  const ui = findById(uiThemes, uiId) ?? (prefersDark ? DEFAULT_DARK_UI_THEME : DEFAULT_LIGHT_UI_THEME);

  const codeThemes = listCodeThemes(settings);
  const pairedCode =
    findById(BUILTIN_CODE_THEMES, autoCodeThemeId(ui.id, ui.kind)) ?? DEFAULT_CODE_THEME_BY_KIND[ui.kind];
  const code =
    rendering.codeTheme === AUTO_CODE_THEME
      ? pairedCode
      : (findById(codeThemes, rendering.codeTheme) ?? pairedCode);

  const elements = findById(listElementStyles(settings), rendering.elementStyle) ?? DEFAULT_ELEMENT_STYLE;

  return { ui, code, elements };
}

/** `surfaceElevated` -> `surface-elevated`. */
export function toKebabCase(key: string): string {
  return key.replace(/[A-Z0-9]/g, (char) => `-${char.toLowerCase()}`);
}

const FONT_FAMILY_ALLOWED = /[^\p{L}\p{N} ,'"._-]/gu;

/**
 * Makes a user-provided `font-family` list safe to embed in CSS text: only
 * letters, digits, spaces, commas, quotes, dots, underscores and hyphens survive
 * and unbalanced quotes are removed. Returns `fallback` when nothing usable remains.
 */
export function sanitizeFontFamily(value: string, fallback: string): string {
  let clean = value.replace(FONT_FAMILY_ALLOWED, '');
  for (const quote of ["'", '"']) {
    if (clean.split(quote).length % 2 === 0) clean = clean.split(quote).join('');
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(clean) ? clean : fallback;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Returns the colour when it is a valid hex colour, otherwise `fallback` (defence in depth). */
function safeColor(value: string, fallback: string): string {
  return HEX_COLOR.test(value) ? value : fallback;
}

/** Formats a finite number compactly (max. 4 decimals); non-finite numbers yield `fallback`. */
function num(value: number, fallback: number): string {
  const finite = Number.isFinite(value) ? value : fallback;
  return String(Math.round(finite * 10_000) / 10_000);
}

const DEFAULT_SANS = "'Inter Variable', system-ui, sans-serif";
const DEFAULT_MONO = "'JetBrains Mono Variable', ui-monospace, monospace";

const SHADOWS: Readonly<Record<ThemeKind, Readonly<Record<string, string>>>> = {
  dark: {
    '--mpp-ui-shadow-sm': '0 1px 2px rgb(0 0 0 / 0.4)',
    '--mpp-ui-shadow-md': '0 4px 14px rgb(0 0 0 / 0.35), 0 1px 3px rgb(0 0 0 / 0.3)',
    '--mpp-ui-shadow-lg': '0 18px 48px rgb(0 0 0 / 0.5), 0 4px 12px rgb(0 0 0 / 0.35)',
    '--mpp-ui-backdrop': 'rgb(0 0 0 / 0.55)',
  },
  light: {
    '--mpp-ui-shadow-sm': '0 1px 2px rgb(15 23 42 / 0.08)',
    '--mpp-ui-shadow-md': '0 4px 14px rgb(15 23 42 / 0.08), 0 1px 3px rgb(15 23 42 / 0.06)',
    '--mpp-ui-shadow-lg': '0 18px 48px rgb(15 23 42 / 0.16), 0 4px 12px rgb(15 23 42 / 0.08)',
    '--mpp-ui-backdrop': 'rgb(15 23 42 / 0.32)',
  },
};

const HEADING_COLOR_VAR: Readonly<Record<ElementStyle['headings']['color'], string>> = {
  heading: 'var(--mpp-ui-heading)',
  accent: 'var(--mpp-ui-accent)',
  text: 'var(--mpp-ui-editor-text)',
};

/**
 * Converts a resolved theme to CSS custom properties.
 *
 * - UI colours: `colors.surfaceElevated` -> `--mpp-ui-surface-elevated`, plus
 *   `--mpp-ui-shadow-{sm,md,lg}` and `--mpp-ui-backdrop` derived from the theme kind.
 * - Code colours: `colors.controlKeyword` -> `--mpp-code-control-keyword`, plus
 *   `--mpp-code-comment-style` (`italic`/`normal`) and `--mpp-code-keyword-weight` (`700`/`400`).
 * - Element style: `--mpp-el-body-font`, `--mpp-el-heading-font`, `--mpp-el-mono-font`,
 *   `--mpp-el-base-font-size` (px), `--mpp-el-line-height`, `--mpp-el-paragraph-spacing` (em),
 *   `--mpp-el-content-width` (px), `--mpp-el-h1-size` … `--mpp-el-h6-size` (em),
 *   `--mpp-el-heading-weight`, `--mpp-el-heading-letter-spacing` (em), `--mpp-el-heading-color`,
 *   `--mpp-el-code-radius` (px), `--mpp-el-code-font-size` (em), `--mpp-el-list-spacing` (em),
 *   `--mpp-el-image-radius` (px).
 *
 * Every value is safe to embed in CSS text (colours are validated, fonts sanitised).
 */
export function themeToCssVariables(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.ui.colors)) {
    vars[`--mpp-ui-${toKebabCase(key)}`] = safeColor(value, '#808080');
  }
  Object.assign(vars, SHADOWS[theme.ui.kind]);

  for (const [key, value] of Object.entries(theme.code.colors)) {
    vars[`--mpp-code-${toKebabCase(key)}`] = safeColor(value, '#808080');
  }
  vars['--mpp-code-comment-style'] = theme.code.italicComments ? 'italic' : 'normal';
  vars['--mpp-code-keyword-weight'] = theme.code.boldKeywords ? '700' : '400';

  const { typography, headings, codeBlock, list, image } = theme.elements;
  vars['--mpp-el-body-font'] = sanitizeFontFamily(typography.bodyFont, DEFAULT_SANS);
  vars['--mpp-el-heading-font'] = sanitizeFontFamily(typography.headingFont, DEFAULT_SANS);
  vars['--mpp-el-mono-font'] = sanitizeFontFamily(typography.monoFont, DEFAULT_MONO);
  vars['--mpp-el-base-font-size'] = `${num(typography.baseFontSize, 16)}px`;
  vars['--mpp-el-line-height'] = num(typography.lineHeight, 1.6);
  vars['--mpp-el-paragraph-spacing'] = `${num(typography.paragraphSpacing, 1)}em`;
  vars['--mpp-el-content-width'] = `${num(typography.contentWidth, 780)}px`;
  headings.scale.forEach((factor, index) => {
    vars[`--mpp-el-h${index + 1}-size`] = `${num(factor, 1)}em`;
  });
  vars['--mpp-el-heading-weight'] = num(headings.weight, 700);
  vars['--mpp-el-heading-letter-spacing'] = `${num(headings.letterSpacing, 0)}em`;
  vars['--mpp-el-heading-color'] = HEADING_COLOR_VAR[headings.color];
  vars['--mpp-el-code-radius'] = `${num(codeBlock.radius, 8)}px`;
  vars['--mpp-el-code-font-size'] = `${num(codeBlock.fontSize, 0.875)}em`;
  vars['--mpp-el-list-spacing'] = `${num(list.spacing, 0.3)}em`;
  vars['--mpp-el-image-radius'] = `${num(image.radius, 0)}px`;
  return vars;
}

const bool = (value: boolean): string => (value ? 'true' : 'false');

/**
 * Data attributes describing every enum/boolean variant of the theme. They are
 * set on the document root and drive the variant selectors of `css/elements.css`.
 */
export function themeRootAttributes(theme: ResolvedTheme): Record<string, string> {
  const el = theme.elements;
  return {
    'data-mpp-theme-kind': theme.ui.kind,
    'data-mpp-code-kind': theme.code.kind,
    'data-mpp-ui-theme': theme.ui.id,
    'data-mpp-code-theme': theme.code.id,
    'data-mpp-element-style': el.id,
    'data-mpp-quote': el.blockquote.variant,
    'data-mpp-quote-italic': bool(el.blockquote.italic),
    'data-mpp-codeblock': el.codeBlock.variant,
    'data-mpp-code-line-numbers': bool(el.codeBlock.lineNumbers),
    'data-mpp-code-show-language': bool(el.codeBlock.showLanguage),
    'data-mpp-inline-code': el.inlineCode.variant,
    'data-mpp-table': el.table.variant,
    'data-mpp-table-compact': bool(el.table.compact),
    'data-mpp-bullet': el.list.bullet,
    'data-mpp-link': el.link.variant,
    'data-mpp-hr': el.horizontalRule.variant,
    'data-mpp-heading-underline': el.headings.underline,
    'data-mpp-heading-color': el.headings.color,
    'data-mpp-uppercase-small': bool(el.headings.uppercaseSmall),
    'data-mpp-image-centered': bool(el.image.centered),
    'data-mpp-image-shadow': bool(el.image.shadow),
  };
}

/**
 * Applies a theme to a root element (normally `document.documentElement`): sets
 * all CSS variables, removes stale `--mpp-*` variables from a previous theme,
 * sets the variant data attributes and the `color-scheme`.
 */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  const vars = themeToCssVariables(theme);
  const stale: string[] = [];
  for (let index = 0; index < root.style.length; index += 1) {
    const name = root.style.item(index);
    if (name.startsWith('--mpp-') && !(name in vars)) stale.push(name);
  }
  for (const name of stale) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  for (const [name, value] of Object.entries(themeRootAttributes(theme))) root.setAttribute(name, value);
  root.style.colorScheme = theme.ui.kind;
}
