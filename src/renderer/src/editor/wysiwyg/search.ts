import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { notifyingSearchController, type SearchListeners } from '../search-listeners';
import type { SearchController, SearchQuery, SearchState } from '../types';
import {
  type CompiledSearch,
  compileSearchQuery,
  expandReplacement,
  findTextMatches,
  MAX_SEARCH_MATCHES,
  type TextMatch,
} from './search-matcher';

/** CSS class of every match decoration. */
export const SEARCH_MATCH_CLASS = 'mpp-search-match';
/** CSS class added to the current match. */
export const SEARCH_CURRENT_CLASS = 'mpp-search-current';

/** Placeholder for inline non-text nodes (images, math, hard breaks) so matches cannot span them silently. */
const OBJECT_REPLACEMENT = '￼';

/** A match mapped to ProseMirror document positions. */
export interface DocMatch extends TextMatch {
  readonly from: number;
  readonly to: number;
}

export interface SearchPluginState {
  readonly search: CompiledSearch | null;
  readonly matches: readonly DocMatch[];
  /** 0-based index of the current match, -1 when there is none. */
  readonly current: number;
  readonly error: string | null;
  readonly decorations: DecorationSet;
}

type SearchMeta =
  | { readonly type: 'setQuery'; readonly query: SearchQuery; readonly anchor: number }
  | { readonly type: 'setCurrent'; readonly index: number }
  | { readonly type: 'afterReplace'; readonly anchor: number | null }
  | { readonly type: 'clear' };

export const searchPluginKey = new PluginKey<SearchPluginState>('mpp-search');

const EMPTY_STATE: SearchPluginState = {
  search: null,
  matches: [],
  current: -1,
  error: null,
  decorations: DecorationSet.empty,
};

/**
 * Finds all matches of `search` in the textblocks of `doc`. Text of adjacent
 * text nodes inside one textblock is concatenated, so a match may span
 * differently formatted runs (`**bo**ld`). Matches never cross block boundaries.
 */
export function findDocMatches(
  doc: ProseNode,
  search: CompiledSearch,
  limit = MAX_SEARCH_MATCHES,
): DocMatch[] {
  const matches: DocMatch[] = [];
  doc.descendants((node, pos) => {
    if (matches.length >= limit) return false;
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText) {
        const value = child.textContent;
        for (let index = 0; index < value.length; index += 1) positions.push(childPos + index);
        text += value;
      } else {
        positions.push(childPos);
        text += OBJECT_REPLACEMENT;
      }
    });
    positions.push(pos + 1 + node.content.size);
    for (const match of findTextMatches(text, search, limit - matches.length)) {
      matches.push({ ...match, from: positions[match.from] ?? 0, to: positions[match.to] ?? 0 });
    }
    return false;
  });
  return matches;
}

/** Index of the first match starting at or after `pos` (wrapping to 0), or -1 without matches. */
export function matchIndexAtOrAfter(matches: readonly DocMatch[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.from >= pos);
  return index === -1 ? 0 : index;
}

function buildDecorations(doc: ProseNode, matches: readonly DocMatch[], current: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === current ? `${SEARCH_MATCH_CLASS} ${SEARCH_CURRENT_CLASS}` : SEARCH_MATCH_CLASS,
      }),
    ),
  );
}

/**
 * Recomputes the matches of `search` in `doc`. `pickCurrent` selects the
 * current match from the new match list (-1 for none).
 */
function withMatches(
  doc: ProseNode,
  search: CompiledSearch,
  pickCurrent: (matches: readonly DocMatch[]) => number,
): SearchPluginState {
  const matches = findDocMatches(doc, search);
  const current = pickCurrent(matches);
  return { search, matches, current, error: null, decorations: buildDecorations(doc, matches, current) };
}

const anchoredAt =
  (anchor: number | null) =>
  (matches: readonly DocMatch[]): number =>
    anchor === null ? -1 : matchIndexAtOrAfter(matches, anchor);

function applyMeta(meta: SearchMeta, tr: Transaction, previous: SearchPluginState): SearchPluginState {
  switch (meta.type) {
    case 'clear':
      return EMPTY_STATE;
    case 'setQuery': {
      const compiled = compileSearchQuery(meta.query);
      if (!compiled.ok) return { ...EMPTY_STATE, error: compiled.error };
      if (compiled.search === null) return EMPTY_STATE;
      return withMatches(tr.doc, compiled.search, anchoredAt(meta.anchor));
    }
    case 'afterReplace':
      return previous.search === null
        ? EMPTY_STATE
        : withMatches(tr.doc, previous.search, anchoredAt(meta.anchor));
    case 'setCurrent': {
      const current = meta.index >= 0 && meta.index < previous.matches.length ? meta.index : -1;
      return { ...previous, current, decorations: buildDecorations(tr.doc, previous.matches, current) };
    }
  }
}

/**
 * The ProseMirror plugin holding the search state and its decorations.
 * `listeners` (the controller's, see {@link createProseMirrorSearchController})
 * are notified after every transaction that changed the search state, e.g.
 * when an edit added or removed matches.
 */
export function createSearchPlugin(listeners?: SearchListeners): Plugin<SearchPluginState> {
  return new Plugin<SearchPluginState>({
    key: searchPluginKey,
    view: () => ({
      update(view, previousState) {
        const next = getSearchPluginState(view.state);
        if (listeners?.active === true && next !== getSearchPluginState(previousState)) {
          listeners.emit(toSearchState(next));
        }
      },
    }),
    state: {
      init: () => EMPTY_STATE,
      apply(tr, previous) {
        const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;
        if (meta !== undefined) return applyMeta(meta, tr, previous);
        if (tr.docChanged && previous.search !== null) {
          // Keep the current match only if it still exists at its mapped position.
          const currentMatch = previous.matches[previous.current];
          const anchor = currentMatch === undefined ? null : tr.mapping.map(currentMatch.from, 1);
          return withMatches(tr.doc, previous.search, (matches) =>
            anchor === null ? -1 : matches.findIndex((match) => match.from === anchor),
          );
        }
        return previous;
      },
    },
    props: {
      decorations(state) {
        return getSearchPluginState(state).decorations;
      },
    },
  });
}

/** Reads the plugin state (empty when the plugin is not installed). */
export function getSearchPluginState(state: EditorState): SearchPluginState {
  return searchPluginKey.getState(state) ?? EMPTY_STATE;
}

/** The {@link SearchState} reported for a plugin state. */
export function toSearchState(state: SearchPluginState): SearchState {
  return { total: state.matches.length, current: state.current + 1, error: state.error };
}

const NO_SEARCH: SearchState = { total: 0, current: 0, error: null };

/**
 * Creates the {@link SearchController} of the WYSIWYG editor. `getView`
 * returns null while the editor is not (yet / any more) mounted, in which case
 * every operation is a no-op that reports an empty result. Pass the same
 * `listeners` to {@link createSearchPlugin} so subscribers see document edits.
 */
export function createProseMirrorSearchController(
  getView: () => EditorView | null,
  listeners: SearchListeners,
): SearchController {
  const selectCurrent = (view: EditorView): SearchState => {
    const state = getSearchPluginState(view.state);
    const match = state.matches[state.current];
    if (match !== undefined) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
          .scrollIntoView(),
      );
    }
    return toSearchState(getSearchPluginState(view.state));
  };

  const move = (direction: 1 | -1): SearchState => {
    const view = getView();
    if (view === null) return NO_SEARCH;
    const state = getSearchPluginState(view.state);
    const { matches } = state;
    if (matches.length === 0) return toSearchState(state);
    const { from, to } = view.state.selection;
    const selected = matches.findIndex((match) => match.from === from && match.to === to);
    let index: number;
    if (direction === 1) {
      index = selected >= 0 ? (selected + 1) % matches.length : matchIndexAtOrAfter(matches, from);
    } else if (selected >= 0) {
      index = (selected - 1 + matches.length) % matches.length;
    } else {
      const before = matches.findLastIndex((match) => match.from < from);
      index = before === -1 ? matches.length - 1 : before;
    }
    view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'setCurrent', index } satisfies SearchMeta));
    return selectCurrent(view);
  };

  return notifyingSearchController(
    {
      setQuery(query) {
        const view = getView();
        if (view === null) return NO_SEARCH;
        const meta: SearchMeta = { type: 'setQuery', query, anchor: view.state.selection.from };
        view.dispatch(view.state.tr.setMeta(searchPluginKey, meta));
        return selectCurrent(view);
      },
      findNext: () => move(1),
      findPrevious: () => move(-1),
      replaceCurrent(replacement) {
        const view = getView();
        if (view === null) return NO_SEARCH;
        const state = getSearchPluginState(view.state);
        const index =
          state.current >= 0 ? state.current : matchIndexAtOrAfter(state.matches, view.state.selection.from);
        const match = state.matches[index];
        if (state.search === null || match === undefined) return toSearchState(state);
        const text = expandReplacement(replacement, match, state.search.isRegexp);
        const tr = view.state.tr.setStoredMarks(null);
        if (text === '') tr.delete(match.from, match.to);
        else tr.insertText(text, match.from, match.to);
        tr.setMeta(searchPluginKey, {
          type: 'afterReplace',
          anchor: tr.mapping.map(match.to),
        } satisfies SearchMeta);
        view.dispatch(tr.scrollIntoView());
        return selectCurrent(view);
      },
      replaceAll(replacement) {
        const view = getView();
        if (view === null) return NO_SEARCH;
        const state = getSearchPluginState(view.state);
        const { search } = state;
        if (search === null || state.matches.length === 0) return toSearchState(state);
        // Replacing back to front keeps the positions of the remaining matches valid.
        const tr = view.state.tr.setStoredMarks(null);
        for (const match of [...state.matches].reverse()) {
          const text = expandReplacement(replacement, match, search.isRegexp);
          if (text === '') tr.delete(match.from, match.to);
          else tr.insertText(text, match.from, match.to);
        }
        tr.setMeta(searchPluginKey, { type: 'afterReplace', anchor: null } satisfies SearchMeta);
        view.dispatch(tr);
        return toSearchState(getSearchPluginState(view.state));
      },
      clear() {
        const view = getView();
        if (view === null) return;
        view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'clear' } satisfies SearchMeta));
      },
    },
    listeners,
  );
}
