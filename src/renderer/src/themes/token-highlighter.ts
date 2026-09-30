import { tagHighlighter, tags as t, type Highlighter } from '@lezer/highlight';

/**
 * Maps @lezer/highlight tags to the `tok-*` classes styled by `css/tokens-classes.css`.
 *
 * It is a superset of `classHighlighter` (same class names for the same tags) that
 * additionally distinguishes functions, control keywords, constants, escapes, tags
 * and attributes, exactly like {@link mppCodeMirrorTheme} does in the editor. Using
 * it for exported HTML makes exported code blocks look identical to the editor.
 */
export const mppTokenHighlighter: Highlighter = tagHighlighter([
  { tag: t.link, class: 'tok-link' },
  { tag: t.heading, class: 'tok-heading' },
  { tag: t.emphasis, class: 'tok-emphasis' },
  { tag: t.strong, class: 'tok-strong' },
  { tag: t.strikethrough, class: 'tok-strikethrough' },
  { tag: t.quote, class: 'tok-quote' },
  { tag: t.monospace, class: 'tok-monospace' },
  { tag: t.list, class: 'tok-list' },
  { tag: t.contentSeparator, class: 'tok-meta' },
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.controlKeyword, class: 'tok-keyword tok-controlKeyword' },
  { tag: t.atom, class: 'tok-atom' },
  { tag: t.bool, class: 'tok-bool' },
  { tag: t.null, class: 'tok-atom' },
  { tag: t.url, class: 'tok-url' },
  { tag: t.labelName, class: 'tok-labelName' },
  { tag: t.inserted, class: 'tok-inserted' },
  { tag: t.deleted, class: 'tok-deleted' },
  { tag: t.changed, class: 'tok-changed' },
  { tag: t.literal, class: 'tok-literal' },
  { tag: t.string, class: 'tok-string' },
  { tag: t.number, class: 'tok-number' },
  { tag: [t.regexp, t.special(t.string)], class: 'tok-string2' },
  { tag: t.escape, class: 'tok-string2 tok-escape' },
  { tag: t.variableName, class: 'tok-variableName' },
  { tag: t.local(t.variableName), class: 'tok-variableName tok-local' },
  { tag: t.definition(t.variableName), class: 'tok-variableName tok-definition' },
  { tag: t.special(t.variableName), class: 'tok-variableName2' },
  { tag: t.constant(t.variableName), class: 'tok-variableName tok-constant' },
  { tag: t.function(t.variableName), class: 'tok-variableName tok-function' },
  { tag: t.function(t.definition(t.variableName)), class: 'tok-variableName tok-definition tok-function' },
  { tag: t.definition(t.propertyName), class: 'tok-propertyName tok-definition' },
  { tag: t.function(t.propertyName), class: 'tok-propertyName tok-function' },
  { tag: t.propertyName, class: 'tok-propertyName' },
  { tag: t.typeName, class: 'tok-typeName' },
  { tag: t.namespace, class: 'tok-namespace' },
  { tag: t.className, class: 'tok-className' },
  { tag: t.macroName, class: 'tok-macroName' },
  { tag: t.tagName, class: 'tok-tagName' },
  { tag: t.attributeName, class: 'tok-attributeName' },
  { tag: t.attributeValue, class: 'tok-string' },
  { tag: t.operator, class: 'tok-operator' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: t.meta, class: 'tok-meta' },
  // Markdown marks (list markers, `#`, `*`, backticks), meta-coloured like in the editor.
  { tag: t.processingInstruction, class: 'tok-meta' },
  { tag: t.invalid, class: 'tok-invalid' },
  { tag: t.punctuation, class: 'tok-punctuation' },
]);
