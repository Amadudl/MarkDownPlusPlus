import { EditorView } from '@codemirror/view';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EditorAdapter, EditorCallbacks, EditorOptions, SearchQuery } from '../types';
import { SearchQuery as CodeMirrorQuery } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { createSourceEditor, sourceCursorInfo } from './index';
import { collectMatches, toCodeMirrorQuery } from './search';

const baseOptions: EditorOptions = {
  initialMarkdown: '# Title\n\nHello world\n\n## Second\n',
  documentPath: null,
  spellcheck: true,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  loadRemoteImages: true,
  placeholder: 'Start writing…',
};

const query = (text: string, overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
  ...overrides,
});

const adapters: EditorAdapter[] = [];

function create(options: Partial<EditorOptions> = {}, callbacks: Partial<EditorCallbacks> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onChange = vi.fn<(markdown: string) => void>();
  const onCursorChange = vi.fn();
  const adapter = createSourceEditor(
    host,
    { ...baseOptions, ...options },
    { onChange, onCursorChange, ...callbacks },
  );
  adapters.push(adapter);
  const view = EditorView.findFromDOM(host);
  if (view === null) throw new Error('no view');
  return { adapter, host, view, onChange, onCursorChange };
}

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  document.body.innerHTML = '';
});

describe('createSourceEditor', () => {
  it('mounts CodeMirror with the initial markdown and is ready immediately', async () => {
    const { adapter, host } = create();
    await expect(adapter.ready).resolves.toBeUndefined();
    expect(adapter.mode).toBe('source');
    expect(adapter.getMarkdown()).toBe(baseOptions.initialMarkdown);
    expect(host.classList.contains('mpp-source')).toBe(true);
    expect(host.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(host.querySelector('.cm-content')?.getAttribute('spellcheck')).toBe('true');
  });

  it('emits onChange for user edits but not for setMarkdown', () => {
    const { adapter, view, onChange } = create();
    view.dispatch({ changes: { from: 0, insert: 'X' } });
    expect(onChange).toHaveBeenLastCalledWith(`X${baseOptions.initialMarkdown}`);
    onChange.mockClear();
    adapter.setMarkdown('replaced');
    expect(adapter.getMarkdown()).toBe('replaced');
    adapter.setMarkdown('replaced');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the caret within bounds when content is replaced', () => {
    const { adapter, view } = create();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    adapter.setMarkdown('ab');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('reports 1-based cursor positions and selection lengths', () => {
    const { view, onCursorChange } = create();
    view.dispatch({ selection: { anchor: 9, head: 14 } });
    expect(onCursorChange).toHaveBeenLastCalledWith({ line: 3, column: 6, selectionLength: 5 });
    expect(sourceCursorInfo(view.state)).toEqual({ line: 3, column: 6, selectionLength: 5 });
  });

  it('runs formatting commands as single undoable edits', () => {
    const { adapter, view } = create({ initialMarkdown: 'word' });
    view.dispatch({ selection: { anchor: 0, head: 4 } });
    expect(adapter.runCommand('bold')).toBe(true);
    expect(adapter.getMarkdown()).toBe('**word**');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('word');
    expect(adapter.undo()).toBe(true);
    expect(adapter.getMarkdown()).toBe('word');
    expect(adapter.redo()).toBe(true);
    expect(adapter.getMarkdown()).toBe('**word**');
  });

  it('scrolls to headings by index and ignores unknown indices', () => {
    const { adapter, view } = create();
    adapter.scrollToHeading(1);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(5).from);
    adapter.scrollToHeading(7);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(5).from);
  });

  it('reconfigures options without recreating the view', () => {
    const { adapter, host, view } = create();
    adapter.updateOptions({
      lineNumbers: false,
      wordWrap: false,
      spellcheck: false,
      tabSize: 4,
      placeholder: '',
    });
    expect(host.querySelector('.cm-lineNumbers')).toBeNull();
    expect(host.querySelector('.cm-lineWrapping')).toBeNull();
    expect(host.querySelector('.cm-content')?.getAttribute('spellcheck')).toBe('false');
    expect(view.state.tabSize).toBe(4);
    expect(EditorView.findFromDOM(host)).toBe(view);
    adapter.updateOptions({
      lineNumbers: true,
      wordWrap: true,
      spellcheck: true,
      placeholder: 'Type',
      tabSize: 99,
    });
    expect(host.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(host.querySelector('.cm-lineWrapping')).not.toBeNull();
    expect(view.state.tabSize).toBe(8);
    const dispatch = vi.spyOn(view, 'dispatch');
    adapter.updateOptions({ lineNumbers: true, documentPath: '/x.md', loadRemoteImages: false });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shows the placeholder in an empty document', () => {
    const { host } = create({ initialMarkdown: '' });
    expect(host.querySelector('.cm-placeholder')?.textContent).toBe('Start writing…');
  });

  it('reports focus and blur', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { adapter, view } = create({}, { onFocus, onBlur });
    adapter.focus();
    view.contentDOM.dispatchEvent(new FocusEvent('focus'));
    view.dispatch({});
    expect(onFocus).toHaveBeenCalled();
    view.contentDOM.blur();
    view.contentDOM.dispatchEvent(new FocusEvent('blur'));
    view.dispatch({});
    expect(onBlur).toHaveBeenCalled();
  });

  it('becomes inert after destroy', () => {
    const { adapter, host, onChange } = create();
    adapter.destroy();
    adapter.destroy();
    expect(host.classList.contains('mpp-source')).toBe(false);
    expect(host.querySelector('.cm-editor')).toBeNull();
    adapter.setMarkdown('x');
    expect(adapter.runCommand('bold')).toBe(false);
    expect(adapter.undo()).toBe(false);
    expect(adapter.redo()).toBe(false);
    adapter.focus();
    adapter.scrollToHeading(0);
    adapter.updateOptions({ lineNumbers: false });
    expect(adapter.search.setQuery(query('Title'))).toEqual({ total: 0, current: 0, error: null });
    expect(() => adapter.search.clear()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('source search', () => {
  it('highlights matches, selects the nearest one and counts them', () => {
    const { adapter, host, view } = create({ initialMarkdown: 'one two one two one' });
    view.dispatch({ selection: { anchor: 5 } });
    expect(adapter.search.setQuery(query('one'))).toEqual({ total: 3, current: 2, error: null });
    expect(host.querySelectorAll('.mpp-search-match')).toHaveLength(3);
    expect(host.querySelectorAll('.mpp-search-current')).toHaveLength(1);
    expect(adapter.search.setQuery(query('one'))).toEqual({ total: 3, current: 2, error: null });
  });

  it('wraps to the first match when none follows the caret', () => {
    const { adapter, view } = create({ initialMarkdown: 'one two' });
    view.dispatch({ selection: { anchor: 6 } });
    expect(adapter.search.setQuery(query('one')).current).toBe(1);
  });

  it('navigates with wrap-around', () => {
    const { adapter } = create({ initialMarkdown: 'x a x b x' });
    expect(adapter.search.setQuery(query('x')).current).toBe(1);
    expect(adapter.search.findNext().current).toBe(2);
    expect(adapter.search.findNext().current).toBe(3);
    expect(adapter.search.findNext().current).toBe(1);
    expect(adapter.search.findPrevious().current).toBe(3);
  });

  it('supports case sensitivity, whole words and regular expressions', () => {
    const { adapter } = create({ initialMarkdown: 'Cat cat catalog' });
    expect(adapter.search.setQuery(query('cat')).total).toBe(3);
    expect(adapter.search.setQuery(query('cat', { caseSensitive: true })).total).toBe(2);
    expect(adapter.search.setQuery(query('cat', { wholeWord: true })).total).toBe(2);
    expect(adapter.search.setQuery(query('c\\w+g', { regexp: true })).total).toBe(1);
    expect(adapter.search.setQuery(query('x*', { regexp: true })).total).toBe(0);
  });

  it('matches plain text literally', () => {
    const { adapter } = create({ initialMarkdown: 'a\\nb a.b' });
    expect(adapter.search.setQuery(query('\\n')).total).toBe(1);
    expect(adapter.search.setQuery(query('.')).total).toBe(1);
  });

  it('reports invalid regular expressions and empty queries', () => {
    const { adapter, host } = create();
    const result = adapter.search.setQuery(query('(', { regexp: true }));
    expect(result.total).toBe(0);
    expect(result.error).toMatch(/Invalid regular expression/);
    expect(adapter.search.findNext()).toEqual({ total: 0, current: 0, error: null });
    expect(adapter.search.setQuery(query(''))).toEqual({ total: 0, current: 0, error: null });
    expect(host.querySelector('.cm-search')).toBeNull();
  });

  it('replaces the current match and moves on', () => {
    const { adapter } = create({ initialMarkdown: 'foo bar foo' });
    adapter.search.setQuery(query('foo'));
    expect(adapter.search.replaceCurrent('baz')).toEqual({ total: 1, current: 1, error: null });
    expect(adapter.getMarkdown()).toBe('baz bar foo');
  });

  it('replaces with regular expression groups and replaces all at once', () => {
    const { adapter } = create({ initialMarkdown: 'a=1 b=2' });
    adapter.search.setQuery(query('(\\w)=(\\d)', { regexp: true }));
    expect(adapter.search.replaceAll('$2=$1')).toEqual({ total: 0, current: 0, error: null });
    expect(adapter.getMarkdown()).toBe('1=a 2=b');
    expect(adapter.undo()).toBe(true);
    expect(adapter.getMarkdown()).toBe('a=1 b=2');
  });

  it('collects no matches for an invalid query and caps the count', () => {
    const state = EditorState.create({ doc: 'aaaa' });
    expect(collectMatches(state, new CodeMirrorQuery({ search: '' }))).toEqual([]);
    expect(collectMatches(state, toCodeMirrorQuery(query('a')), 2)).toHaveLength(2);
  });

  it('clears the query and its highlights', () => {
    const { adapter, host } = create({ initialMarkdown: 'one' });
    adapter.search.setQuery(query('one'));
    adapter.search.clear();
    expect(host.querySelectorAll('.mpp-search-match')).toHaveLength(0);
    expect(adapter.search.replaceAll('x')).toEqual({ total: 0, current: 0, error: null });
  });
});
