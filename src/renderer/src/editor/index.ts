/**
 * Public API of the editor layer. The shell only needs {@link EditorHost}, the
 * contract types and the pure markdown helpers; the factories are exported for
 * tests and alternative hosts.
 */
export type {
  CursorInfo,
  EditorAdapter,
  EditorCallbacks,
  EditorFactory,
  EditorOptions,
  FormatCommand,
  SearchController,
  SearchListener,
  SearchQuery,
  SearchState,
} from './types';
export { EditorHost, type EditorHostProps } from './EditorHost';
export { createSourceEditor } from './source';
export { createWysiwygEditor } from './wysiwyg';
export {
  countWords,
  documentStats,
  extractHeadings,
  stripInlineMarkdown,
  WORDS_PER_MINUTE,
  type DocumentStats,
  type HeadingLevel,
  type MarkdownHeading,
} from './markdown-utils';
