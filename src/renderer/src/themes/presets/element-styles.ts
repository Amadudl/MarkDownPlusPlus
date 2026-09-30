import type { ElementStyle } from '@shared/theme-model';

/**
 * Built-in element styles: complete, coherent "document designs" that define
 * typography and the look of every rendered markdown element. Colours always come
 * from the active UI and code themes, so every style works with every scheme.
 */

const SANS = "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO =
  "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace";
/**
 * Serif stack of core fonts that ship with macOS and Windows (Georgia), with the
 * metric-compatible Liberation / DejaVu faces most Linux distributions install.
 */
const CORE_SERIF = "Georgia, 'Liberation Serif', 'DejaVu Serif', 'Times New Roman', serif";
/** Sans stack of core fonts that ship with macOS and Windows (Arial), plus Linux substitutes. */
const CORE_SANS = "Arial, 'Liberation Sans', Helvetica, 'DejaVu Sans', sans-serif";
/** Monospace stack of core fonts that ship with macOS and Windows (Courier New), plus Linux substitutes. */
const CORE_MONO = "'Courier New', 'Liberation Mono', Courier, 'DejaVu Sans Mono', monospace";
const OLD_STYLE_SERIF =
  "'Iowan Old Style', 'Palatino Linotype', Palatino, Charter, 'Bitstream Charter', Georgia, serif";

const modern: ElementStyle = {
  id: 'modern',
  name: 'Modern',
  description: 'Clean Inter typography, generous spacing, card quotes and floating code blocks.',
  typography: {
    bodyFont: SANS,
    headingFont: SANS,
    monoFont: MONO,
    baseFontSize: 16,
    lineHeight: 1.7,
    paragraphSpacing: 1,
    contentWidth: 780,
  },
  headings: {
    scale: [2.25, 1.75, 1.375, 1.15, 1, 0.875],
    weight: 700,
    letterSpacing: -0.02,
    color: 'heading',
    underline: 'none',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'card', italic: false },
  codeBlock: { variant: 'shadow', radius: 12, showLanguage: true, lineNumbers: false, fontSize: 0.875 },
  inlineCode: { variant: 'pill' },
  table: { variant: 'striped', compact: false },
  list: { bullet: 'disc', spacing: 0.35 },
  link: { variant: 'accent' },
  horizontalRule: { variant: 'fade' },
  image: { radius: 12, shadow: true, centered: true },
};

const github: ElementStyle = {
  id: 'github',
  name: 'GitHub',
  description: 'The familiar look of READMEs and docs rendered on GitHub.',
  typography: {
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
    headingFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
    monoFont: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    baseFontSize: 16,
    lineHeight: 1.5,
    paragraphSpacing: 1,
    contentWidth: 900,
  },
  headings: {
    scale: [2, 1.5, 1.25, 1, 0.875, 0.85],
    weight: 600,
    letterSpacing: 0,
    color: 'heading',
    underline: 'h1-h2',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'bar', italic: false },
  codeBlock: { variant: 'flat', radius: 6, showLanguage: false, lineNumbers: false, fontSize: 0.85 },
  inlineCode: { variant: 'pill' },
  table: { variant: 'grid', compact: false },
  list: { bullet: 'disc', spacing: 0.25 },
  link: { variant: 'hover' },
  horizontalRule: { variant: 'line' },
  image: { radius: 0, shadow: false, centered: false },
};

const academic: ElementStyle = {
  id: 'academic',
  name: 'Academic',
  description: 'A LaTeX-like paper: old-style serif body, restrained headings and booktabs tables.',
  typography: {
    bodyFont: OLD_STYLE_SERIF,
    headingFont: OLD_STYLE_SERIF,
    monoFont: MONO,
    baseFontSize: 17,
    lineHeight: 1.65,
    paragraphSpacing: 0.9,
    contentWidth: 720,
  },
  headings: {
    scale: [1.9, 1.5, 1.25, 1.1, 1, 1],
    weight: 600,
    letterSpacing: 0,
    color: 'text',
    underline: 'none',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'minimal', italic: true },
  codeBlock: { variant: 'bordered', radius: 2, showLanguage: false, lineNumbers: true, fontSize: 0.85 },
  inlineCode: { variant: 'plain' },
  table: { variant: 'minimal', compact: false },
  list: { bullet: 'disc', spacing: 0.2 },
  link: { variant: 'underline' },
  horizontalRule: { variant: 'line' },
  image: { radius: 0, shadow: false, centered: true },
};

const minimal: ElementStyle = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Quiet, Notion-like pages that stay out of the way of your words.',
  typography: {
    bodyFont: "'Inter Variable', ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, sans-serif",
    headingFont: "'Inter Variable', ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, sans-serif",
    monoFont: MONO,
    baseFontSize: 16,
    lineHeight: 1.6,
    paragraphSpacing: 0.6,
    contentWidth: 720,
  },
  headings: {
    scale: [1.875, 1.5, 1.25, 1.1, 1, 0.9],
    weight: 650,
    letterSpacing: -0.01,
    color: 'text',
    underline: 'none',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'bar', italic: false },
  codeBlock: { variant: 'flat', radius: 4, showLanguage: false, lineNumbers: false, fontSize: 0.85 },
  inlineCode: { variant: 'pill' },
  table: { variant: 'minimal', compact: false },
  list: { bullet: 'disc', spacing: 0.15 },
  link: { variant: 'underline' },
  horizontalRule: { variant: 'line' },
  image: { radius: 4, shadow: false, centered: false },
};

const typewriter: ElementStyle = {
  id: 'typewriter',
  name: 'Typewriter',
  description: 'Monospace everything, dashed rules and small caps: a manuscript straight off the platen.',
  typography: {
    bodyFont: "'JetBrains Mono Variable', 'IBM Plex Mono', 'Courier Prime', 'Courier New', monospace",
    headingFont: "'JetBrains Mono Variable', 'IBM Plex Mono', 'Courier Prime', 'Courier New', monospace",
    monoFont: "'JetBrains Mono Variable', 'IBM Plex Mono', 'Courier Prime', 'Courier New', monospace",
    baseFontSize: 15,
    lineHeight: 1.75,
    paragraphSpacing: 1.1,
    contentWidth: 760,
  },
  headings: {
    scale: [1.6, 1.35, 1.15, 1, 1, 1],
    weight: 700,
    letterSpacing: 0,
    color: 'text',
    underline: 'h1',
    uppercaseSmall: true,
  },
  blockquote: { variant: 'bar', italic: false },
  codeBlock: { variant: 'bordered', radius: 0, showLanguage: true, lineNumbers: true, fontSize: 0.9 },
  inlineCode: { variant: 'underline' },
  table: { variant: 'grid', compact: false },
  list: { bullet: 'dash', spacing: 0.3 },
  link: { variant: 'dotted' },
  horizontalRule: { variant: 'dashed' },
  image: { radius: 0, shadow: false, centered: false },
};

const editorial: ElementStyle = {
  id: 'editorial',
  name: 'Editorial',
  description: 'Magazine layout with large, tightly set serif headings, pull quotes and ornamental rules.',
  typography: {
    bodyFont: CORE_SERIF,
    headingFont: CORE_SERIF,
    monoFont: MONO,
    baseFontSize: 18,
    lineHeight: 1.75,
    paragraphSpacing: 1.2,
    contentWidth: 720,
  },
  headings: {
    scale: [3, 2.25, 1.6, 1.25, 1.05, 0.9],
    weight: 700,
    letterSpacing: -0.015,
    color: 'heading',
    underline: 'none',
    uppercaseSmall: true,
  },
  blockquote: { variant: 'quote-mark', italic: true },
  codeBlock: { variant: 'shadow', radius: 8, showLanguage: true, lineNumbers: false, fontSize: 0.8 },
  inlineCode: { variant: 'outlined' },
  table: { variant: 'minimal', compact: false },
  list: { bullet: 'square', spacing: 0.4 },
  link: { variant: 'underline' },
  horizontalRule: { variant: 'ornament' },
  image: { radius: 2, shadow: true, centered: true },
};

const compact: ElementStyle = {
  id: 'compact',
  name: 'Compact',
  description: 'Dense technical documentation: small type, wide pages and tight tables.',
  typography: {
    bodyFont: SANS,
    headingFont: SANS,
    monoFont: MONO,
    baseFontSize: 14,
    lineHeight: 1.5,
    paragraphSpacing: 0.6,
    contentWidth: 1080,
  },
  headings: {
    scale: [1.6, 1.35, 1.15, 1.05, 1, 0.9],
    weight: 650,
    letterSpacing: -0.01,
    color: 'heading',
    underline: 'h1',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'bar', italic: false },
  codeBlock: { variant: 'bordered', radius: 4, showLanguage: true, lineNumbers: true, fontSize: 0.85 },
  inlineCode: { variant: 'outlined' },
  table: { variant: 'grid', compact: true },
  list: { bullet: 'disc', spacing: 0.1 },
  link: { variant: 'accent' },
  horizontalRule: { variant: 'line' },
  image: { radius: 4, shadow: false, centered: false },
};

const book: ElementStyle = {
  id: 'book',
  name: 'Book',
  description: 'A printed book: serif text, centred small-caps headings and ornamental breaks.',
  typography: {
    bodyFont: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    headingFont: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    monoFont: MONO,
    baseFontSize: 18,
    lineHeight: 1.7,
    paragraphSpacing: 1,
    contentWidth: 680,
  },
  headings: {
    scale: [2.1, 1.6, 1.3, 1.1, 1, 0.95],
    weight: 500,
    letterSpacing: 0.01,
    color: 'text',
    underline: 'none',
    uppercaseSmall: true,
  },
  blockquote: { variant: 'minimal', italic: true },
  codeBlock: { variant: 'flat', radius: 2, showLanguage: false, lineNumbers: false, fontSize: 0.8 },
  inlineCode: { variant: 'plain' },
  table: { variant: 'minimal', compact: false },
  list: { bullet: 'circle', spacing: 0.25 },
  link: { variant: 'dotted' },
  horizontalRule: { variant: 'ornament' },
  image: { radius: 0, shadow: false, centered: true },
};

const technical: ElementStyle = {
  id: 'technical',
  name: 'Technical',
  description: 'Engineering docs: window-style code with language badges, grid tables and callouts.',
  typography: {
    bodyFont: "'Inter Variable', 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    headingFont: SANS,
    monoFont: MONO,
    baseFontSize: 15,
    lineHeight: 1.6,
    paragraphSpacing: 0.85,
    contentWidth: 900,
  },
  headings: {
    scale: [2, 1.5, 1.25, 1.1, 1, 0.9],
    weight: 650,
    letterSpacing: -0.01,
    color: 'heading',
    underline: 'h1-h2',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'callout', italic: false },
  codeBlock: { variant: 'window', radius: 10, showLanguage: true, lineNumbers: true, fontSize: 0.85 },
  inlineCode: { variant: 'outlined' },
  table: { variant: 'grid', compact: false },
  list: { bullet: 'arrow', spacing: 0.25 },
  link: { variant: 'accent' },
  horizontalRule: { variant: 'dashed' },
  image: { radius: 6, shadow: true, centered: false },
};

const playful: ElementStyle = {
  id: 'playful',
  name: 'Playful',
  description: 'Rounded, friendly and colourful: heavy gradient headings, bubbly code and card tables.',
  typography: {
    bodyFont: SANS,
    headingFont: SANS,
    monoFont: MONO,
    baseFontSize: 17,
    lineHeight: 1.7,
    paragraphSpacing: 1,
    contentWidth: 760,
  },
  headings: {
    scale: [2.4, 1.8, 1.4, 1.15, 1, 0.9],
    weight: 800,
    letterSpacing: -0.01,
    color: 'accent',
    underline: 'none',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'card', italic: false },
  codeBlock: { variant: 'window', radius: 18, showLanguage: true, lineNumbers: false, fontSize: 0.9 },
  inlineCode: { variant: 'pill' },
  table: { variant: 'card', compact: false },
  list: { bullet: 'arrow', spacing: 0.4 },
  link: { variant: 'hover' },
  horizontalRule: { variant: 'dotted' },
  image: { radius: 20, shadow: true, centered: true },
};

const classic: ElementStyle = {
  id: 'classic',
  name: 'Classic',
  description: 'A word-processor document: Arial body, Georgia headings, Courier code and bordered tables.',
  typography: {
    bodyFont: CORE_SANS,
    headingFont: CORE_SERIF,
    monoFont: CORE_MONO,
    baseFontSize: 15,
    lineHeight: 1.4,
    paragraphSpacing: 0.7,
    contentWidth: 816,
  },
  headings: {
    scale: [2, 1.6, 1.3, 1.1, 1, 0.95],
    weight: 700,
    letterSpacing: 0,
    color: 'accent',
    underline: 'none',
    uppercaseSmall: false,
  },
  blockquote: { variant: 'bar', italic: true },
  codeBlock: { variant: 'bordered', radius: 0, showLanguage: false, lineNumbers: false, fontSize: 0.9 },
  inlineCode: { variant: 'plain' },
  table: { variant: 'bordered', compact: false },
  list: { bullet: 'disc', spacing: 0.15 },
  link: { variant: 'underline' },
  horizontalRule: { variant: 'line' },
  image: { radius: 0, shadow: false, centered: false },
};

/** The default element style (also the fallback for unknown ids). */
export const DEFAULT_ELEMENT_STYLE: ElementStyle = modern;

/** All built-in element styles. */
export const BUILTIN_ELEMENT_STYLES: readonly ElementStyle[] = Object.freeze([
  modern,
  github,
  academic,
  minimal,
  typewriter,
  editorial,
  compact,
  book,
  technical,
  playful,
  classic,
]);
