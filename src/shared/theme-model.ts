import { z } from 'zod';

/**
 * Theme data model. Themes are plain, JSON-serialisable data so that users can
 * create, duplicate, import and export them. The renderer turns them into CSS
 * custom properties (see `src/renderer/src/themes/engine.ts`).
 */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const colorSchema = z.string().regex(HEX_COLOR, 'Expected a hex colour such as #1e1e1e');

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Ids are lowercase kebab-case');
const nameSchema = z.string().trim().min(1).max(64);
export const themeKindSchema = z.enum(['light', 'dark']);
export type ThemeKind = z.infer<typeof themeKindSchema>;

/** Colours of the application chrome (window, sidebars, tabs, dialogs) and editor surface. */
export const uiThemeColorsSchema = z.object({
  background: colorSchema,
  surface: colorSchema,
  surfaceElevated: colorSchema,
  surfaceSunken: colorSchema,
  border: colorSchema,
  borderStrong: colorSchema,
  text: colorSchema,
  textMuted: colorSchema,
  textFaint: colorSchema,
  accent: colorSchema,
  accentHover: colorSchema,
  accentText: colorSchema,
  selection: colorSchema,
  focusRing: colorSchema,
  danger: colorSchema,
  warning: colorSchema,
  success: colorSchema,
  editorBackground: colorSchema,
  editorText: colorSchema,
  link: colorSchema,
  heading: colorSchema,
  quoteBar: colorSchema,
  quoteBackground: colorSchema,
  tableBorder: colorSchema,
  tableHeaderBackground: colorSchema,
  tableStripe: colorSchema,
  inlineCodeBackground: colorSchema,
  inlineCodeText: colorSchema,
  mark: colorSchema,
});
export type UiThemeColors = z.infer<typeof uiThemeColorsSchema>;

export const uiThemeSchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: themeKindSchema,
  colors: uiThemeColorsSchema,
});
export type UiTheme = z.infer<typeof uiThemeSchema>;

/** Syntax colours for fenced code blocks (WYSIWYG) and the markdown source editor. */
export const codeThemeColorsSchema = z.object({
  background: colorSchema,
  foreground: colorSchema,
  gutterBackground: colorSchema,
  gutterForeground: colorSchema,
  lineHighlight: colorSchema,
  selection: colorSchema,
  cursor: colorSchema,
  border: colorSchema,
  comment: colorSchema,
  keyword: colorSchema,
  controlKeyword: colorSchema,
  operator: colorSchema,
  punctuation: colorSchema,
  string: colorSchema,
  number: colorSchema,
  boolean: colorSchema,
  constant: colorSchema,
  variable: colorSchema,
  property: colorSchema,
  function: colorSchema,
  type: colorSchema,
  className: colorSchema,
  tag: colorSchema,
  attribute: colorSchema,
  regexp: colorSchema,
  escape: colorSchema,
  heading: colorSchema,
  emphasis: colorSchema,
  strong: colorSchema,
  link: colorSchema,
  quote: colorSchema,
  meta: colorSchema,
  invalid: colorSchema,
});
export type CodeThemeColors = z.infer<typeof codeThemeColorsSchema>;

export const codeThemeSchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: themeKindSchema,
  /** Human readable origin, e.g. "Inspired by the classic Monokai scheme". */
  description: z.string().max(200).default(''),
  colors: codeThemeColorsSchema,
  italicComments: z.boolean().default(true),
  boldKeywords: z.boolean().default(false),
});
export type CodeTheme = z.infer<typeof codeThemeSchema>;

/** Bounds of one heading font-size multiplier (the range the settings UI offers). */
export const HEADING_SCALE_RANGE = Object.freeze({ min: 0.6, max: 4 });

const headingScaleSchema = z.number().min(HEADING_SCALE_RANGE.min).max(HEADING_SCALE_RANGE.max);

/** How every rendered markdown element looks in the WYSIWYG view and in HTML/PDF export. */
export const elementStyleSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().max(200).default(''),
  typography: z.object({
    bodyFont: z.string().min(1).max(300),
    headingFont: z.string().min(1).max(300),
    monoFont: z.string().min(1).max(300),
    baseFontSize: z.number().min(10).max(32),
    lineHeight: z.number().min(1).max(2.6),
    paragraphSpacing: z.number().min(0).max(3),
    contentWidth: z.number().min(480).max(2400),
  }),
  headings: z.object({
    /** Font-size multipliers (em) for h1..h6, bounded like the other typography values. */
    scale: z.tuple([
      headingScaleSchema,
      headingScaleSchema,
      headingScaleSchema,
      headingScaleSchema,
      headingScaleSchema,
      headingScaleSchema,
    ]),
    weight: z.number().int().min(300).max(900),
    letterSpacing: z.number().min(-0.1).max(0.3),
    color: z.enum(['heading', 'accent', 'text']),
    underline: z.enum(['none', 'h1', 'h1-h2']),
    uppercaseSmall: z.boolean(),
  }),
  blockquote: z.object({
    variant: z.enum(['bar', 'card', 'quote-mark', 'minimal', 'callout']),
    italic: z.boolean(),
  }),
  codeBlock: z.object({
    variant: z.enum(['flat', 'bordered', 'shadow', 'window']),
    radius: z.number().min(0).max(24),
    showLanguage: z.boolean(),
    lineNumbers: z.boolean(),
    fontSize: z.number().min(0.6).max(1.4),
  }),
  inlineCode: z.object({
    variant: z.enum(['pill', 'outlined', 'plain', 'underline']),
  }),
  table: z.object({
    variant: z.enum(['grid', 'striped', 'minimal', 'bordered', 'card']),
    compact: z.boolean(),
  }),
  list: z.object({
    bullet: z.enum(['disc', 'circle', 'square', 'dash', 'arrow']),
    spacing: z.number().min(0).max(2),
  }),
  link: z.object({
    variant: z.enum(['underline', 'hover', 'accent', 'dotted']),
  }),
  horizontalRule: z.object({
    variant: z.enum(['line', 'dashed', 'dotted', 'fade', 'ornament']),
  }),
  image: z.object({
    radius: z.number().min(0).max(32),
    shadow: z.boolean(),
    centered: z.boolean(),
  }),
});
export type ElementStyle = z.infer<typeof elementStyleSchema>;
