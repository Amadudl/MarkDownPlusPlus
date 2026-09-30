import { history, undo } from '@milkdown/kit/prose/history';
import { type Node as ProseNode, Schema } from '@milkdown/kit/prose/model';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SearchQuery } from '../types';
import { SearchListeners } from '../search-listeners';
import { compileSearchQuery } from './search-matcher';
import {
  createProseMirrorSearchController,
  createSearchPlugin,
  type DocMatch,
  findDocMatches,
  getSearchPluginState,
  matchIndexAtOrAfter,
  SEARCH_CURRENT_CLASS,
  SEARCH_MATCH_CLASS,
  searchPluginKey,
} from './search';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      toDOM: () => ['pre', ['code', 0]],
    },
    text: { group: 'inline' },
    image: { group: 'inline', inline: true, atom: true, toDOM: () => ['img'] },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    em: { toDOM: () => ['em', 0] },
  },
});

const {
  paragraph,
  code_block: codeBlock,
  image,
} = schema.nodes as Record<string, NonNullable<Schema['nodes'][string]>>;
const strong = schema.marks.strong.create();
const em = schema.marks.em.create();

const t = (text: string, ...marks: (typeof strong)[]): ProseNode => schema.text(text, marks);
const p = (...content: ProseNode[]): ProseNode => paragraph!.create(null, content);
const doc = (...blocks: ProseNode[]): ProseNode => schema.node('doc', null, blocks);

const q = (text: string, overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
  ...overrides,
});

function compiled(query: SearchQuery) {
  const result = compileSearchQuery(query);
  if (!result.ok || result.search === null) throw new Error('invalid');
  return result.search;
}

const views: EditorView[] = [];

function mount(content: ProseNode): EditorView {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView(host, {
    state: EditorState.create({ doc: content, plugins: [history(), createSearchPlugin()] }),
  });
  views.push(view);
  return view;
}

const selectedText = (view: EditorView): string =>
  view.state.doc.textBetween(view.state.selection.from, view.state.selection.to);

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = '';
});

describe('findDocMatches', () => {
  it('finds matches spanning differently marked text nodes and maps positions', () => {
    const content = doc(p(t('a '), t('bo', strong), t('ld', em), t(' bold')));
    const matches = findDocMatches(content, compiled(q('bold')));
    expect(matches.map((m) => content.textBetween(m.from, m.to))).toEqual(['bold', 'bold']);
    expect(matches[0]).toMatchObject({ from: 3, to: 7 });
  });

  it('never matches across blocks or inline atoms but finds text on both sides', () => {
    const quote = schema.nodes.blockquote.create(null, [p(t('bc'))]);
    const content = doc(
      p(t('ab')),
      p(t('c'), image!.create(), t('d')),
      codeBlock!.create(null, t('abcd')),
      quote,
    );
    expect(findDocMatches(content, compiled(q('bc')))).toHaveLength(2);
    expect(findDocMatches(content, compiled(q('cd')))).toHaveLength(1);
    const dot = findDocMatches(content, compiled(q('c.d', { regexp: true })));
    expect(dot.map((m) => [m.from, m.to])).toEqual([[5, 8]]);
  });

  it('respects the match limit across blocks', () => {
    const content = doc(p(t('aaa')), p(t('aaa')), p(t('aaa')));
    expect(findDocMatches(content, compiled(q('a')), 4)).toHaveLength(4);
    expect(findDocMatches(content, compiled(q('a')), 3)).toHaveLength(3);
  });

  it('handles empty textblocks', () => {
    expect(findDocMatches(doc(p()), compiled(q('a')))).toEqual([]);
  });
});

describe('matchIndexAtOrAfter', () => {
  const matches = [{ from: 2 }, { from: 10 }] as DocMatch[];
  it('finds the first match at or after a position and wraps', () => {
    expect(matchIndexAtOrAfter([], 0)).toBe(-1);
    expect(matchIndexAtOrAfter(matches, 0)).toBe(0);
    expect(matchIndexAtOrAfter(matches, 3)).toBe(1);
    expect(matchIndexAtOrAfter(matches, 11)).toBe(0);
  });
});

describe('search plugin', () => {
  it('starts empty and exposes an empty state without the plugin', () => {
    const state = EditorState.create({ doc: doc(p(t('x'))) });
    expect(getSearchPluginState(state).matches).toEqual([]);
    const view = mount(doc(p(t('x'))));
    expect(getSearchPluginState(view.state).current).toBe(-1);
  });

  it('decorates matches and the current match', () => {
    const view = mount(doc(p(t('one two one'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    expect(search.setQuery(q('one'))).toEqual({ total: 2, current: 1, error: null });
    expect(view.dom.querySelectorAll(`.${SEARCH_MATCH_CLASS}`)).toHaveLength(2);
    expect(view.dom.querySelectorAll(`.${SEARCH_CURRENT_CLASS}`)).toHaveLength(1);
    expect(selectedText(view)).toBe('one');
  });

  it('starts at the first match at or after the caret', () => {
    const view = mount(doc(p(t('one two one'))));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    expect(search.setQuery(q('one')).current).toBe(2);
  });

  it('reports zero matches, errors and clears', () => {
    const view = mount(doc(p(t('abc'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    expect(search.setQuery(q('zzz'))).toEqual({ total: 0, current: 0, error: null });
    const invalid = search.setQuery(q('(', { regexp: true }));
    expect(invalid.total).toBe(0);
    expect(invalid.error).toMatch(/Invalid regular expression/);
    expect(search.setQuery(q(''))).toEqual({ total: 0, current: 0, error: null });
    search.setQuery(q('b'));
    search.clear();
    expect(getSearchPluginState(view.state).search).toBeNull();
    expect(view.dom.querySelectorAll(`.${SEARCH_MATCH_CLASS}`)).toHaveLength(0);
  });

  it('navigates forwards and backwards with wrap-around', () => {
    const view = mount(doc(p(t('x a x b x'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    expect(search.setQuery(q('x')).current).toBe(1);
    expect(search.findNext().current).toBe(2);
    expect(search.findNext().current).toBe(3);
    expect(search.findNext().current).toBe(1);
    expect(search.findPrevious().current).toBe(3);
    expect(search.findPrevious().current).toBe(2);
  });

  it('navigates relative to a caret that is not on a match', () => {
    const view = mount(doc(p(t('x a x b x'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('x'));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
    expect(search.findNext().current).toBe(2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
    expect(search.findPrevious().current).toBe(1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(search.findPrevious().current).toBe(3);
  });

  it('returns the empty state when navigating without matches', () => {
    const view = mount(doc(p(t('abc'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    expect(search.findNext()).toEqual({ total: 0, current: 0, error: null });
    expect(search.replaceCurrent('x')).toEqual({ total: 0, current: 0, error: null });
    expect(search.replaceAll('x')).toEqual({ total: 0, current: 0, error: null });
  });

  it('replaces the current match preserving marks and moves to the next one', () => {
    const view = mount(doc(p(t('foo', strong), t(' and foo'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('foo'));
    expect(search.replaceCurrent('bar')).toEqual({ total: 1, current: 1, error: null });
    const first = view.state.doc.firstChild!.firstChild!;
    expect(first.text).toBe('bar');
    expect(first.marks.map((mark) => mark.type.name)).toEqual(['strong']);
    expect(view.state.doc.textContent).toBe('bar and foo');
    expect(selectedText(view)).toBe('foo');
  });

  it('replaces the match after the caret when none is current and supports deletion', () => {
    const view = mount(doc(p(t('a-b-c'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('-'));
    view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'setCurrent', index: 99 }));
    expect(getSearchPluginState(view.state).current).toBe(-1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    search.replaceCurrent('');
    expect(view.state.doc.textContent).toBe('a-bc');
  });

  it('expands regular expression replacement templates', () => {
    const view = mount(doc(p(t('john smith'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('(\\w+) (\\w+)', { regexp: true }));
    search.replaceCurrent('$2, $1');
    expect(view.state.doc.textContent).toBe('smith, john');
  });

  it('replaces all matches in a single undoable step', () => {
    const view = mount(doc(p(t('cat dog', em), t(' cat')), p(t('cat'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('cat', { wholeWord: true }));
    expect(search.replaceAll('cow')).toEqual({ total: 0, current: 0, error: null });
    expect(view.state.doc.textBetween(0, view.state.doc.content.size, '\n')).toBe('cow dog cow\ncow');
    expect(view.state.doc.firstChild!.firstChild!.marks[0]?.type.name).toBe('em');
    undo(view.state, view.dispatch);
    expect(view.state.doc.textBetween(0, view.state.doc.content.size, '\n')).toBe('cat dog cat\ncat');
  });

  it('deletes all matches with an empty replacement', () => {
    const view = mount(doc(p(t('a-b-c'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('-'));
    search.replaceAll('');
    expect(view.state.doc.textContent).toBe('abc');
  });

  it('keeps matches up to date when the document changes', () => {
    const view = mount(doc(p(t('ab ab'))));
    const search = createProseMirrorSearchController(() => view, new SearchListeners());
    search.setQuery(q('ab'));
    view.dispatch(view.state.tr.insertText('ab ', 1));
    let state = getSearchPluginState(view.state);
    expect(state.matches).toHaveLength(3);
    expect(state.current).toBe(1);
    view.dispatch(view.state.tr.delete(4, 6));
    state = getSearchPluginState(view.state);
    expect(state.matches).toHaveLength(2);
    expect(state.current).toBe(-1);
    view.dispatch(view.state.tr.insertText('ab', 1));
    expect(getSearchPluginState(view.state).current).toBe(-1);
  });

  it('ignores document changes and replacements without an active query', () => {
    const view = mount(doc(p(t('ab'))));
    view.dispatch(view.state.tr.insertText('x', 1));
    expect(getSearchPluginState(view.state).search).toBeNull();
    view.dispatch(view.state.tr.setMeta(searchPluginKey, { type: 'afterReplace', anchor: 1 }));
    expect(getSearchPluginState(view.state).search).toBeNull();
  });

  it('is a no-op without a mounted view', () => {
    const search = createProseMirrorSearchController(() => null, new SearchListeners());
    const empty = { total: 0, current: 0, error: null };
    expect(search.setQuery(q('a'))).toEqual(empty);
    expect(search.findNext()).toEqual(empty);
    expect(search.findPrevious()).toEqual(empty);
    expect(search.replaceCurrent('a')).toEqual(empty);
    expect(search.replaceAll('a')).toEqual(empty);
    expect(() => search.clear()).not.toThrow();
  });
});

describe('search subscriptions', () => {
  it('notifies the controller listeners about state changes, including edits', () => {
    const listeners = new SearchListeners();
    const host = document.createElement('div');
    document.body.append(host);
    const view = new EditorView(host, {
      state: EditorState.create({
        doc: doc(p(t('one two one'))),
        plugins: [history(), createSearchPlugin(listeners)],
      }),
    });
    views.push(view);
    const search = createProseMirrorSearchController(() => view, listeners);
    const listener = vi.fn();
    // Without listeners nothing is computed or emitted.
    search.setQuery(q('one'));
    const unsubscribe = search.subscribe(listener);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    expect(listener).not.toHaveBeenCalled();
    view.dispatch(view.state.tr.insertText(' one', view.state.doc.content.size - 1));
    expect(listener).toHaveBeenLastCalledWith({ total: 3, current: 1, error: null });
    search.clear();
    expect(listener).toHaveBeenLastCalledWith({ total: 0, current: 0, error: null });
    unsubscribe();
  });
});
