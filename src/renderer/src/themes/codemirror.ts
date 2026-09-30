import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * CodeMirror styling for the markdown source editor and the code blocks of the
 * WYSIWYG editor. Every colour is a `var(--mpp-code-*)` / `var(--mpp-ui-*)`
 * reference, so switching themes only swaps CSS variables on the document root
 * and the extension never has to be reconfigured.
 *
 * The source editor may set `--mpp-source-font-family` / `--mpp-source-font-size`
 * on an ancestor; otherwise the element style's monospace font is used.
 */

const code = (name: string): string => `var(--mpp-code-${name})`;

const baseTheme = EditorView.theme({
  '&': {
    color: code('foreground'),
    backgroundColor: code('background'),
    fontSize: 'var(--mpp-source-font-size, inherit)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--mpp-source-font-family, var(--mpp-el-mono-font))',
    lineHeight: '1.6',
    fontVariantLigatures: 'contextual',
  },
  '.cm-content': { caretColor: code('cursor'), padding: '12px 0' },
  '.cm-line': { padding: '0 16px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: code('cursor'), borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: code('selection') },
  '.cm-selectionMatch': {
    backgroundColor: `color-mix(in srgb, ${code('selection')} 55%, transparent)`,
  },
  '.cm-activeLine': { backgroundColor: code('line-highlight') },
  '.cm-gutters': {
    backgroundColor: code('gutter-background'),
    color: code('gutter-foreground'),
    border: 'none',
    borderRight: `1px solid color-mix(in srgb, ${code('border')} 60%, transparent)`,
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 16px',
    minWidth: '3ch',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-activeLineGutter': {
    backgroundColor: code('line-highlight'),
    color: code('foreground'),
  },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
  '.cm-foldPlaceholder': {
    backgroundColor: `color-mix(in srgb, ${code('foreground')} 10%, transparent)`,
    border: 'none',
    color: code('comment'),
    borderRadius: '4px',
    padding: '0 6px',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--mpp-ui-mark)',
    borderRadius: '2px',
    outline: `1px solid color-mix(in srgb, var(--mpp-ui-warning) 55%, transparent)`,
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--mpp-ui-warning)',
    color: 'var(--mpp-ui-background)',
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: `color-mix(in srgb, ${code('foreground')} 14%, transparent)`,
    outline: `1px solid color-mix(in srgb, ${code('foreground')} 30%, transparent)`,
    color: 'inherit',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: `color-mix(in srgb, ${code('invalid')} 25%, transparent)`,
    color: 'inherit',
  },
  '.cm-placeholder': { color: code('comment'), fontStyle: 'italic' },
  '.cm-trailingSpace': { backgroundColor: `color-mix(in srgb, ${code('invalid')} 20%, transparent)` },
  '.cm-tooltip': {
    backgroundColor: 'var(--mpp-ui-surface-elevated)',
    color: 'var(--mpp-ui-text)',
    border: '1px solid var(--mpp-ui-border)',
    borderRadius: '8px',
    boxShadow: 'var(--mpp-ui-shadow-md)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mpp-el-mono-font)', padding: '4px' },
  '.cm-tooltip-autocomplete > ul > li': { borderRadius: '5px', padding: '2px 8px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--mpp-ui-accent)',
    color: 'var(--mpp-ui-accent-text)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--mpp-ui-surface)',
    color: 'var(--mpp-ui-text)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--mpp-ui-border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--mpp-ui-border)' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--mpp-ui-danger)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--mpp-ui-warning)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: `underline wavy var(--mpp-ui-danger)` },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: `underline wavy var(--mpp-ui-warning)`,
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.comment, color: code('comment'), fontStyle: code('comment-style') },
  { tag: t.keyword, color: code('keyword'), fontWeight: code('keyword-weight') },
  { tag: t.controlKeyword, color: code('control-keyword'), fontWeight: code('keyword-weight') },
  { tag: t.operator, color: code('operator') },
  { tag: t.punctuation, color: code('punctuation') },
  { tag: [t.string, t.attributeValue], color: code('string') },
  { tag: [t.number, t.literal, t.changed], color: code('number') },
  { tag: t.bool, color: code('boolean') },
  { tag: [t.atom, t.null, t.special(t.variableName), t.constant(t.variableName)], color: code('constant') },
  { tag: [t.variableName, t.labelName], color: code('variable') },
  { tag: t.propertyName, color: code('property') },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: code('function'),
  },
  { tag: [t.typeName, t.namespace], color: code('type') },
  { tag: t.className, color: code('class-name') },
  { tag: t.tagName, color: code('tag') },
  { tag: t.attributeName, color: code('attribute') },
  { tag: [t.regexp, t.special(t.string)], color: code('regexp') },
  { tag: t.escape, color: code('escape') },
  { tag: [t.meta, t.contentSeparator], color: code('meta') },
  { tag: t.invalid, color: code('invalid') },
  { tag: t.inserted, color: code('string') },
  { tag: t.deleted, color: code('invalid') },
  // Markdown (source view)
  { tag: t.heading, color: code('heading'), fontWeight: '700' },
  { tag: t.heading1, color: code('heading'), fontWeight: '800' },
  { tag: t.emphasis, color: code('emphasis'), fontStyle: 'italic' },
  { tag: t.strong, color: code('strong'), fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: code('link') },
  { tag: t.url, color: code('link'), textDecoration: 'underline', textUnderlineOffset: '2px' },
  { tag: t.quote, color: code('quote'), fontStyle: 'italic' },
  { tag: t.monospace, color: code('string') },
  // List markers (ListMark) are processingInstruction tokens and get the meta colour. There is
  // deliberately no `t.list` rule: lezer tags whole list nodes with it, which would colour
  // every list item's text.
  { tag: t.processingInstruction, color: code('meta') },
]);

/** CodeMirror theme + syntax highlighting driven entirely by the MarkDown++ CSS variables. */
export const mppCodeMirrorTheme: Extension = [baseTheme, syntaxHighlighting(highlightStyle)];

/** The highlight style, exposed for tests and for reuse (e.g. static highlighting). */
export const mppHighlightStyle: HighlightStyle = highlightStyle;
