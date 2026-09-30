import { useEffect, useRef, type JSX } from 'react';
import type { EditorMode } from '@shared/types';
import type { EditorHostProps } from '@renderer/editor/EditorHost';
import type {
  EditorAdapter,
  EditorOptions,
  FormatCommand,
  SearchController,
  SearchListener,
  SearchQuery,
  SearchState,
} from '@renderer/editor/types';

/** A lightweight, fully functional in-memory editor adapter for shell tests. */
export interface FakeAdapter extends EditorAdapter {
  markdown: string;
  readonly commands: FormatCommand[];
  readonly scrolledTo: number[];
  readonly optionUpdates: Partial<Omit<EditorOptions, 'initialMarkdown'>>[];
  focusCount: number;
  undoCount: number;
  redoCount: number;
  destroyed: boolean;
  searchCleared: number;
  /** Number of registered search listeners. */
  readonly searchListenerCount: () => number;
  /** Simulates the user typing: replaces the content, emits `onChange` and notifies search listeners. */
  type(markdown: string): void;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface FakeSearch extends SearchController {
  /** Notifies the listeners of the current state (after a simulated edit). */
  notify(): void;
  listenerCount(): number;
}

function createSearch(adapter: { markdown: string; searchCleared: number }): FakeSearch {
  let query: SearchQuery = { text: '', caseSensitive: false, wholeWord: false, regexp: false };
  let current = 0;
  const listeners = new Set<SearchListener>();

  const matches = (): {
    readonly total: number;
    readonly error: string | null;
    readonly pattern: RegExp | null;
  } => {
    if (query.text === '') return { total: 0, error: null, pattern: null };
    let source = query.regexp ? query.text : escapeRegExp(query.text);
    if (query.wholeWord) source = `\\b${source}\\b`;
    try {
      const pattern = new RegExp(source, query.caseSensitive ? 'g' : 'gi');
      return { total: [...adapter.markdown.matchAll(pattern)].length, error: null, pattern };
    } catch (error) {
      return { total: 0, error: error instanceof Error ? error.message : 'Invalid pattern', pattern: null };
    }
  };

  const state = (): SearchState => {
    const { total, error } = matches();
    if (total === 0) current = 0;
    else if (current === 0 || current > total) current = 1;
    return { total, current, error };
  };

  const replaceNth = (replacement: string, nth: number | null): SearchState => {
    const { pattern } = matches();
    if (pattern !== null) {
      let index = 0;
      adapter.markdown = adapter.markdown.replace(pattern, (match) => {
        index += 1;
        return nth === null || index === nth ? replacement : match;
      });
    }
    return state();
  };

  const report = (next: SearchState): SearchState => {
    for (const listener of listeners) listener(next);
    return next;
  };

  return {
    setQuery(next) {
      query = next;
      current = 0;
      return report(state());
    },
    findNext() {
      const { total } = matches();
      current = total === 0 ? 0 : (current % total) + 1;
      return report(state());
    },
    findPrevious() {
      const { total } = matches();
      current = total === 0 ? 0 : ((current - 2 + total) % total) + 1;
      return report(state());
    },
    replaceCurrent(replacement) {
      return report(replaceNth(replacement, Math.max(current, 1)));
    },
    replaceAll(replacement) {
      return report(replaceNth(replacement, null));
    },
    clear() {
      adapter.searchCleared += 1;
      query = { ...query, text: '' };
      report({ total: 0, current: 0, error: null });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      report(state());
    },
    listenerCount: () => listeners.size,
  };
}

/** Creates a fake adapter; `onChange` receives simulated edits. */
export function createFakeAdapter(
  mode: EditorMode,
  initialMarkdown: string,
  onChange: (markdown: string) => void = () => undefined,
): FakeAdapter {
  const adapter: FakeAdapter = {
    mode,
    ready: Promise.resolve(),
    markdown: initialMarkdown,
    commands: [],
    scrolledTo: [],
    optionUpdates: [],
    focusCount: 0,
    undoCount: 0,
    redoCount: 0,
    destroyed: false,
    searchCleared: 0,
    search: undefined as unknown as SearchController,
    searchListenerCount: () => search.listenerCount(),
    getMarkdown: () => adapter.markdown,
    setMarkdown: (markdown) => {
      adapter.markdown = markdown;
      search.notify();
    },
    focus: () => {
      adapter.focusCount += 1;
    },
    runCommand: (command) => {
      adapter.commands.push(command);
      return true;
    },
    undo: () => {
      adapter.undoCount += 1;
      return true;
    },
    redo: () => {
      adapter.redoCount += 1;
      return true;
    },
    scrollToHeading: (index) => {
      adapter.scrolledTo.push(index);
    },
    updateOptions: (options) => {
      adapter.optionUpdates.push(options);
    },
    destroy: () => {
      adapter.destroyed = true;
    },
    type: (markdown) => {
      adapter.markdown = markdown;
      onChange(markdown);
      search.notify();
    },
  };
  const search = createSearch(adapter);
  (adapter as { search: SearchController }).search = search;
  return adapter;
}

/** Adapters of the currently mounted fake editors, by document id. */
export const fakeAdapters = new Map<string, FakeAdapter>();

/** Drop-in replacement for `@renderer/editor/EditorHost` used with `vi.mock`. */
export function EditorHost(props: EditorHostProps): JSX.Element {
  const { docId, mode, revision } = props;
  const latest = useRef(props);
  const appliedRevision = useRef(revision);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const current = latest.current;
    const adapter = createFakeAdapter(mode, current.initialMarkdown, (markdown) =>
      latest.current.onChange(docId, markdown),
    );
    fakeAdapters.set(docId, adapter);
    current.onAdapter(docId, adapter);
    current.onCursorChange(docId, { line: 1, column: mode === 'source' ? 1 : 0, selectionLength: 0 });
    return () => {
      adapter.destroy();
      if (fakeAdapters.get(docId) === adapter) fakeAdapters.delete(docId);
      latest.current.onAdapter(docId, null);
    };
  }, [docId, mode]);

  // Like the real host: a new revision replaces the content of the live editor.
  useEffect(() => {
    if (appliedRevision.current === revision) return;
    appliedRevision.current = revision;
    fakeAdapters.get(docId)?.setMarkdown(latest.current.initialMarkdown);
  }, [docId, revision]);

  return (
    <div
      data-testid={`editor-${docId}`}
      data-mode={mode}
      data-active={String(props.active)}
      className="mpp-document"
    >
      {props.initialMarkdown}
    </div>
  );
}
