import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SearchListeners } from '../search-listeners';
import type { SearchQuery } from '../types';
import { NESTED_QUANTIFIER_ERROR } from '../wysiwyg/search-matcher';
import {
  createCodeMirrorSearchController,
  regexpError,
  sourceSearchExtension,
  sourceSearchState,
  SOURCE_CURRENT_CLASS,
  SOURCE_MATCH_CLASS,
} from './search';

const query = (text: string, overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
  ...overrides,
});

const views: EditorView[] = [];

function mount(doc: string) {
  const listeners = new SearchListeners();
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: sourceSearchExtension(listeners) }),
  });
  views.push(view);
  return { view, search: createCodeMirrorSearchController(() => view, listeners) };
}

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = '';
});

describe('regexpError', () => {
  it('reports syntax errors first, then nested repetition', () => {
    expect(regexpError('a[')).toMatch(/Invalid regular expression/);
    expect(regexpError('(a+)+')).toBe(NESTED_QUANTIFIER_ERROR);
    expect(regexpError('a+b')).toBeNull();
  });

  it('keeps nested repetition out of the editor', () => {
    const { search, view } = mount('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab');
    expect(search.setQuery(query('(a+)+$', { regexp: true }))).toEqual({
      total: 0,
      current: 0,
      error: NESTED_QUANTIFIER_ERROR,
    });
    expect(sourceSearchState(view.state).total).toBe(0);
  });
});

describe('source search subscriptions', () => {
  it('notifies listeners when edits or selection changes affect the matches', () => {
    const { search, view } = mount('cat dog cat');
    const listener = vi.fn();
    view.dispatch({ selection: { anchor: 1 } });
    const unsubscribe = search.subscribe(listener);
    expect(search.setQuery(query('cat'))).toEqual({ total: 2, current: 2, error: null });
    expect(listener).toHaveBeenLastCalledWith({ total: 2, current: 2, error: null });
    view.dispatch({ changes: { from: view.state.doc.length, insert: ' cat' } });
    expect(listener).toHaveBeenLastCalledWith({ total: 3, current: 2, error: null });
    expect(view.dom.querySelectorAll(`.${SOURCE_MATCH_CLASS}`)).toHaveLength(3);
    expect(view.dom.querySelectorAll(`.${SOURCE_CURRENT_CLASS}`)).toHaveLength(1);
    listener.mockClear();
    // Updates that change neither the document, the selection nor the query are not reported.
    view.dispatch({});
    expect(listener).not.toHaveBeenCalled();
    search.clear();
    expect(listener).toHaveBeenLastCalledWith({ total: 0, current: 0, error: null });
    unsubscribe();
    listener.mockClear();
    view.dispatch({ changes: { from: 0, insert: 'cat ' } });
    expect(listener).not.toHaveBeenCalled();
  });
});
