import type { EditorMode } from '@shared/types';

/** Formatting operations available from the toolbar, menu, palette and shortcuts. */
export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'table'
  | 'horizontalRule';

export interface CursorInfo {
  /** 1-based line in the markdown source (source mode) or block index (WYSIWYG). */
  readonly line: number;
  /** 1-based column; 0 when not meaningful (WYSIWYG). */
  readonly column: number;
  /** Number of selected characters. */
  readonly selectionLength: number;
}

export interface SearchQuery {
  readonly text: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly regexp: boolean;
}

export interface SearchState {
  /** Total number of matches in the document. */
  readonly total: number;
  /** 1-based index of the current match, 0 when there is none. */
  readonly current: number;
  /** Set when `regexp` is true and the pattern is invalid. */
  readonly error: string | null;
}

/** Receives the new search state after it changed. */
export type SearchListener = (state: SearchState) => void;

/** Find & replace, implemented by both editors. */
export interface SearchController {
  setQuery(query: SearchQuery): SearchState;
  findNext(): SearchState;
  findPrevious(): SearchState;
  replaceCurrent(replacement: string): SearchState;
  replaceAll(replacement: string): SearchState;
  clear(): void;
  /**
   * Calls `listener` with the search state after every operation of this
   * controller and whenever the state may have changed for other reasons (the
   * user edits the document or moves the selection, content is reloaded).
   * Returns an unsubscribe function.
   */
  subscribe(listener: SearchListener): () => void;
}

export interface EditorCallbacks {
  /** Called (debounced by the adapter is not required) whenever the document changes. */
  onChange(markdown: string): void;
  onCursorChange?(info: CursorInfo): void;
  onFocus?(): void;
  onBlur?(): void;
}

export interface EditorOptions {
  readonly initialMarkdown: string;
  /** Absolute path of the document, used to resolve relative image paths. */
  readonly documentPath: string | null;
  readonly spellcheck: boolean;
  readonly tabSize: number;
  readonly wordWrap: boolean;
  readonly lineNumbers: boolean;
  readonly loadRemoteImages: boolean;
  readonly placeholder: string;
}

/**
 * Common contract of the WYSIWYG (Milkdown/Crepe) and the source (CodeMirror)
 * editor. The shell only ever talks to editors through this interface, which
 * keeps the two implementations interchangeable and independently testable.
 */
export interface EditorAdapter {
  readonly mode: EditorMode;
  /** Resolves once the editor is fully mounted and interactive. */
  readonly ready: Promise<void>;
  getMarkdown(): string;
  /** Replaces the content without emitting `onChange`. */
  setMarkdown(markdown: string): void;
  focus(): void;
  runCommand(command: FormatCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  /** Scrolls to the n-th heading (0-based, document order). */
  scrollToHeading(index: number): void;
  /** Applies option changes (settings) without recreating the editor. */
  updateOptions(options: Partial<Omit<EditorOptions, 'initialMarkdown'>>): void;
  readonly search: SearchController;
  destroy(): void;
}

export type EditorFactory = (
  host: HTMLElement,
  options: EditorOptions,
  callbacks: EditorCallbacks,
) => EditorAdapter;
