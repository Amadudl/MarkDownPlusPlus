import {
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  SearchQuery as CodeMirrorQuery,
  setSearchQuery,
} from '@codemirror/search';
import { type EditorState, type Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { notifyingSearchController, type SearchListeners } from '../search-listeners';
import type { SearchController, SearchQuery, SearchState } from '../types';
import { hasNestedQuantifier, MAX_SEARCH_MATCHES, NESTED_QUANTIFIER_ERROR } from '../wysiwyg/search-matcher';

/** CSS classes shared with the WYSIWYG search so both editors look identical. */
export const SOURCE_MATCH_CLASS = 'mpp-search-match';
export const SOURCE_CURRENT_CLASS = 'mpp-search-current';

/** Upper bound of decorated matches per visible range (the total count is capped separately). */
const MAX_VISIBLE_MATCHES = 2_000;

interface Range {
  readonly from: number;
  readonly to: number;
}

const matchDecoration = Decoration.mark({ class: SOURCE_MATCH_CLASS });
const currentDecoration = Decoration.mark({ class: `${SOURCE_MATCH_CLASS} ${SOURCE_CURRENT_CLASS}` });

/** Rejects zero-length matches (e.g. of `a*`) so navigation always selects something. */
const nonEmpty = (match: string): boolean => match.length > 0;

/** Converts our query to a CodeMirror query; plain text is matched literally (no `\n` unescaping). */
export function toCodeMirrorQuery(query: SearchQuery, replace = ''): CodeMirrorQuery {
  return new CodeMirrorQuery({
    search: query.text,
    caseSensitive: query.caseSensitive,
    regexp: query.regexp,
    wholeWord: query.wholeWord,
    literal: true,
    replace,
    test: nonEmpty,
  });
}

/**
 * Returns the error message of an invalid regular expression, or of one whose
 * nested repetition could freeze the editor ({@link hasNestedQuantifier}), or
 * null when the pattern may be searched.
 */
export function regexpError(source: string): string | null {
  try {
    new RegExp(source, 'gmu');
  } catch (error) {
    // The RegExp constructor only ever throws a SyntaxError.
    return (error as SyntaxError).message;
  }
  return hasNestedQuantifier(source) ? NESTED_QUANTIFIER_ERROR : null;
}

/** Collects up to `limit` matches of the active query in the whole document. */
export function collectMatches(
  state: EditorState,
  query: CodeMirrorQuery,
  limit = MAX_SEARCH_MATCHES,
): Range[] {
  const matches: Range[] = [];
  if (!query.valid) return matches;
  const cursor = query.getCursor(state);
  for (let next = cursor.next(); next.done !== true && matches.length < limit; next = cursor.next()) {
    matches.push({ from: next.value.from, to: next.value.to });
  }
  return matches;
}

function buildDecorations(view: EditorView): DecorationSet {
  const query = getSearchQuery(view.state);
  if (!query.valid) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const { main } = view.state.selection;
  for (const { from, to } of view.visibleRanges) {
    const cursor = query.getCursor(view.state, from, to);
    let count = 0;
    for (let next = cursor.next(); next.done !== true && count < MAX_VISIBLE_MATCHES; next = cursor.next()) {
      const match = next.value;
      const isCurrent = match.from === main.from && match.to === main.to;
      builder.add(match.from, match.to, isCurrent ? currentDecoration : matchDecoration);
      count += 1;
    }
  }
  return builder.finish();
}

const searchHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        getSearchQuery(update.state) !== getSearchQuery(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** The search state of `state`: all matches of the active query and the selected one. */
export function sourceSearchState(state: EditorState): SearchState {
  const matches = collectMatches(state, getSearchQuery(state));
  const { main } = state.selection;
  const index = matches.findIndex((match) => match.from === main.from && match.to === main.to);
  return { total: matches.length, current: index + 1, error: null };
}

/**
 * Search state field (from `@codemirror/search`) plus our own match
 * highlighting. CodeMirror's panel is never opened: MarkDown++ has its own
 * find bar, and CodeMirror only highlights matches while its panel is open.
 * `listeners` (the controller's) are notified whenever an update may have
 * changed the matches or the current match.
 */
export function sourceSearchExtension(listeners: SearchListeners): Extension {
  return [
    search({ scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: 'center' }) }),
    searchHighlighter,
    EditorView.updateListener.of((update) => {
      if (!listeners.active) return;
      const queryChanged = getSearchQuery(update.state) !== getSearchQuery(update.startState);
      if (update.docChanged || update.selectionSet || queryChanged) {
        listeners.emit(sourceSearchState(update.state));
      }
    }),
  ];
}

const NO_SEARCH: SearchState = { total: 0, current: 0, error: null };
const EMPTY_QUERY = new CodeMirrorQuery({ search: '' });

/**
 * Creates the {@link SearchController} of the source editor. Pass the same
 * `listeners` to {@link sourceSearchExtension}.
 */
export function createCodeMirrorSearchController(
  getView: () => EditorView | null,
  listeners: SearchListeners,
): SearchController {
  let active: SearchQuery | null = null;

  const stateOf = (view: EditorView): SearchState => sourceSearchState(view.state);

  /** Selects the first match at or after the selection start (wrapping), unless one is selected already. */
  const selectNearest = (view: EditorView): void => {
    const matches = collectMatches(view.state, getSearchQuery(view.state));
    const { main } = view.state.selection;
    const target = matches.find((match) => match.from >= main.from) ?? matches[0];
    const alreadySelected = matches.some((match) => match.from === main.from && match.to === main.to);
    if (target === undefined || alreadySelected) return;
    view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
      userEvent: 'select.search',
    });
  };

  const withActive = (action: (view: EditorView, query: SearchQuery) => void): SearchState => {
    const view = getView();
    if (view === null || active === null) return NO_SEARCH;
    action(view, active);
    return stateOf(view);
  };

  return notifyingSearchController(
    {
      setQuery(query) {
        const view = getView();
        if (view === null) return NO_SEARCH;
        const error = query.regexp && query.text !== '' ? regexpError(query.text) : null;
        if (query.text === '' || error !== null) {
          active = null;
          view.dispatch({ effects: setSearchQuery.of(EMPTY_QUERY) });
          return { total: 0, current: 0, error };
        }
        active = query;
        view.dispatch({ effects: setSearchQuery.of(toCodeMirrorQuery(query)) });
        selectNearest(view);
        return stateOf(view);
      },
      findNext: () => withActive((view) => void findNext(view)),
      findPrevious: () => withActive((view) => void findPrevious(view)),
      replaceCurrent: (replacement) =>
        withActive((view, query) => {
          view.dispatch({ effects: setSearchQuery.of(toCodeMirrorQuery(query, replacement)) });
          selectNearest(view);
          replaceNext(view);
        }),
      replaceAll: (replacement) =>
        withActive((view, query) => {
          view.dispatch({ effects: setSearchQuery.of(toCodeMirrorQuery(query, replacement)) });
          replaceAll(view);
        }),
      clear() {
        active = null;
        const view = getView();
        if (view !== null) view.dispatch({ effects: setSearchQuery.of(EMPTY_QUERY) });
      },
    },
    listeners,
  );
}
