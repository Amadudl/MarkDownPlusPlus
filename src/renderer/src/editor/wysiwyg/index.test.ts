import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EditorAdapter, EditorCallbacks, EditorOptions, FormatCommand } from '../types';
import { BLOCKED_IMAGE_PLACEHOLDER, createWysiwygEditor, joinFrontMatter, wysiwygViewOf } from './index';

/*
 * These tests run the real Milkdown Crepe editor in jsdom. Layout APIs that
 * jsdom lacks are stubbed; everything else (parsing, serialisation, commands,
 * plugins, node views) is the production code path.
 */

const baseOptions: EditorOptions = {
  initialMarkdown: '# Title\n\nHello **world**\n',
  documentPath: '/docs/readme.md',
  spellcheck: true,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  loadRemoteImages: false,
  placeholder: 'Start writing…',
};

const adapters: EditorAdapter[] = [];

interface Harness {
  adapter: EditorAdapter;
  host: HTMLElement;
  onChange: ReturnType<typeof vi.fn<(markdown: string) => void>>;
  onCursorChange: ReturnType<typeof vi.fn>;
  view: () => EditorView;
}

function editorView(adapter: EditorAdapter): EditorView {
  const view = wysiwygViewOf(adapter);
  if (view === null) throw new Error('editor view not mounted');
  return view;
}

function create(options: Partial<EditorOptions> = {}, callbacks: Partial<EditorCallbacks> = {}): Harness {
  const host = document.createElement('div');
  document.body.append(host);
  const onChange = vi.fn<(markdown: string) => void>();
  const onCursorChange = vi.fn();
  const adapter = createWysiwygEditor(
    host,
    { ...baseOptions, ...options },
    { onChange, onCursorChange, ...callbacks },
  );
  adapters.push(adapter);
  return { adapter, host, onChange, onCursorChange, view: () => editorView(adapter) };
}

async function ready(options: Partial<EditorOptions> = {}, callbacks: Partial<EditorCallbacks> = {}) {
  const harness = create(options, callbacks);
  await harness.adapter.ready;
  return harness;
}

function selectText(view: EditorView, text: string): void {
  const hits: { from: number; to: number }[] = [];
  view.state.doc.descendants((node, pos) => {
    const index = node.isText ? (node.text ?? '').indexOf(text) : -1;
    if (index >= 0) hits.push({ from: pos + index, to: pos + index + text.length });
  });
  const hit = hits[0];
  if (hit === undefined) throw new Error(`text not found: ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.from, hit.to)));
}

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {
        /* layout is not available in jsdom */
      }
      unobserve(): void {
        /* layout is not available in jsdom */
      }
      disconnect(): void {
        /* layout is not available in jsdom */
      }
    },
  );
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  document.body.innerHTML = '';
});

describe('createWysiwygEditor lifecycle', () => {
  it('mounts Crepe into a themed document container', async () => {
    const { adapter, host } = create();
    expect(adapter.mode).toBe('wysiwyg');
    expect(host.classList.contains('mpp-document')).toBe(true);
    expect(host.classList.contains('mpp-wysiwyg')).toBe(true);
    expect(adapter.getMarkdown()).toBe(baseOptions.initialMarkdown);
    expect(adapter.runCommand('bold')).toBe(false);
    await adapter.ready;
    expect(host.querySelector('.milkdown .ProseMirror')).not.toBeNull();
    expect(host.querySelector('h1')?.textContent).toBe('Title');
    expect(host.querySelector('.ProseMirror')?.getAttribute('spellcheck')).toBe('true');
  });

  it('does not report the initial load as a change', async () => {
    const { onChange } = await ready({ initialMarkdown: '* a\n* b\n\n| a | b |\n|---|---|\n| 1 | 2 |\n' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports real edits with the serialised markdown', async () => {
    const { view, onChange } = await ready();
    const pm = view();
    pm.dispatch(pm.state.tr.insertText('!', pm.state.doc.content.size - 1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe('# Title\n\nHello **world!**\n');
  });

  it('does not report transactions that leave the markdown unchanged', async () => {
    const { view, onChange, onCursorChange } = await ready();
    const pm = view();
    pm.dispatch(pm.state.tr.setSelection(TextSelection.create(pm.state.doc, 3)));
    expect(onChange).not.toHaveBeenCalled();
    expect(onCursorChange).toHaveBeenLastCalledWith({ line: 1, column: 0, selectionLength: 0 });
    selectText(pm, 'Hello');
    expect(onCursorChange).toHaveBeenLastCalledWith({ line: 2, column: 0, selectionLength: 5 });
  });

  it('replaces the content silently with setMarkdown', async () => {
    const { adapter, onChange, host } = await ready();
    adapter.setMarkdown('## Replaced\n');
    expect(adapter.getMarkdown()).toBe('## Replaced\n');
    expect(host.querySelector('h2')?.textContent).toBe('Replaced');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies content set before the editor is ready', async () => {
    const { adapter, onChange } = create();
    adapter.setMarkdown('Early *content*\n');
    expect(adapter.getMarkdown()).toBe('Early *content*\n');
    await adapter.ready;
    expect(adapter.getMarkdown()).toBe('Early *content*\n');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tears down when destroyed before ready and ignores late resolution', async () => {
    const { adapter, host } = create();
    adapter.destroy();
    await adapter.ready;
    expect(host.querySelector('.ProseMirror')).toBeNull();
    expect(host.classList.contains('mpp-document')).toBe(false);
    adapter.setMarkdown('ignored');
    expect(adapter.getMarkdown()).toBe(baseOptions.initialMarkdown);
    expect(wysiwygViewOf(adapter)).toBeNull();
  });

  it('becomes inert after destroy', async () => {
    const { adapter, onChange } = await ready();
    adapter.destroy();
    adapter.destroy();
    expect(adapter.runCommand('bold')).toBe(false);
    expect(adapter.undo()).toBe(false);
    expect(adapter.redo()).toBe(false);
    adapter.focus();
    adapter.scrollToHeading(0);
    adapter.updateOptions({ spellcheck: false });
    expect(
      adapter.search.setQuery({ text: 'a', caseSensitive: false, wholeWord: false, regexp: false }),
    ).toEqual({
      total: 0,
      current: 0,
      error: null,
    });
    expect(adapter.getMarkdown()).toBe(baseOptions.initialMarkdown);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards focus and blur and never follows links', async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { adapter, view, host } = await ready(
      { initialMarkdown: '[link](https://example.com)\n' },
      { onFocus, onBlur },
    );
    adapter.focus();
    const dom = view().dom;
    dom.dispatchEvent(new FocusEvent('focus'));
    dom.dispatchEvent(new FocusEvent('blur'));
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
    const anchor = host.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true });
    dom.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
  });
});

describe('markdown fidelity', () => {
  it('round-trips images with alt text, captions and inline images', async () => {
    const markdown = '![alt text](a.png)\n\n![](b.png "Caption")\n\nInline ![x](c.png) image\n';
    const { adapter, host } = await ready({ initialMarkdown: markdown });
    expect(adapter.getMarkdown()).toBe(markdown);
    const images = Array.from(host.querySelectorAll('img[data-type="image-block"]'));
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      'mpp-file://local/%2Fdocs%2Fa.png',
      'mpp-file://local/%2Fdocs%2Fb.png',
    ]);
  });

  it('keeps Crepe image ratios and writes GFM-style lists', async () => {
    const { adapter } = await ready({ initialMarkdown: '![0.50](a.png)\n\n* one\n* two\n' });
    expect(adapter.getMarkdown()).toBe('![0.50](a.png)\n\n- one\n- two\n');
  });

  it('blocks remote images when disabled and re-renders them when enabled', async () => {
    const { adapter, host } = await ready({ initialMarkdown: '![r](https://example.com/r.png)\n' });
    const src = () => host.querySelector('img[data-type="image-block"]')?.getAttribute('src');
    expect(src()).toBe(BLOCKED_IMAGE_PLACEHOLDER);
    adapter.updateOptions({ loadRemoteImages: true });
    await vi.waitFor(() => {
      expect(src()).toBe('https://example.com/r.png');
    });
  });

  it('re-resolves relative images when the document path changes', async () => {
    const { adapter, host } = await ready({ initialMarkdown: '![r](img/r.png)\n' });
    adapter.updateOptions({ documentPath: '/other/doc.md' });
    await vi.waitFor(() => {
      expect(host.querySelector('img[data-type="image-block"]')?.getAttribute('src')).toBe(
        'mpp-file://local/%2Fother%2Fimg%2Fr.png',
      );
    });
  });
});

describe('options', () => {
  it('updates spellcheck and the placeholder without recreating the editor', async () => {
    const { adapter, view } = await ready({ initialMarkdown: '' });
    const before = view();
    adapter.updateOptions({ spellcheck: false, placeholder: 'Write here', tabSize: 4 });
    expect(before.dom.getAttribute('spellcheck')).toBe('false');
    expect(before.dom.getAttribute('aria-label')).toBe('Document editor');
    expect(view()).toBe(before);
    expect(before.dom.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')).toBe(
      'Write here',
    );
    adapter.updateOptions({ placeholder: 'Write here', documentPath: baseOptions.documentPath });
  });
});

describe('commands', () => {
  async function runOn(markdown: string, select: string | null, command: FormatCommand): Promise<string> {
    const { adapter, view } = await ready({ initialMarkdown: markdown });
    if (select !== null) selectText(view(), select);
    adapter.runCommand(command);
    return adapter.getMarkdown();
  }

  it.each<[FormatCommand, string]>([
    ['bold', 'a **word** b\n'],
    ['italic', 'a *word* b\n'],
    ['strikethrough', 'a ~~word~~ b\n'],
    ['inlineCode', 'a `word` b\n'],
  ])('toggles the %s mark', async (command, expected) => {
    expect(await runOn('a word b\n', 'word', command)).toBe(expected);
  });

  it('toggles headings and turns them back into paragraphs', async () => {
    expect(await runOn('Text\n', 'Text', 'heading1')).toBe('# Text\n');
    expect(await runOn('Text\n', 'Text', 'heading2')).toBe('## Text\n');
    expect(await runOn('Text\n', 'Text', 'heading3')).toBe('### Text\n');
    expect(await runOn('### Text\n', 'Text', 'heading3')).toBe('Text\n');
    expect(await runOn('## Text\n', 'Text', 'paragraph')).toBe('Text\n');
  });

  it('wraps, converts and lifts lists', async () => {
    expect(await runOn('Item\n', 'Item', 'bulletList')).toBe('- Item\n');
    expect(await runOn('Item\n', 'Item', 'orderedList')).toBe('1. Item\n');
    expect(await runOn('Item\n', 'Item', 'taskList')).toBe('- [ ] Item\n');
    expect(await runOn('- Item\n', 'Item', 'bulletList')).toBe('Item\n');
    expect(await runOn('1. Item\n', 'Item', 'orderedList')).toBe('Item\n');
    expect(await runOn('- [ ] Item\n', 'Item', 'taskList')).toBe('Item\n');
    expect(await runOn('- Item\n', 'Item', 'orderedList')).toBe('1. Item\n');
    expect(await runOn('1. Item\n', 'Item', 'bulletList')).toBe('- Item\n');
    expect(await runOn('- [x] Item\n', 'Item', 'bulletList')).toBe('- Item\n');
    expect(await runOn('- Item\n', 'Item', 'taskList')).toBe('- [ ] Item\n');
    expect(await runOn('1. Item\n', 'Item', 'taskList')).toBe('- [ ] Item\n');
  });

  it('converts only the selected items of a list into tasks', async () => {
    expect(await runOn('- a\n- b\n', 'b', 'taskList')).toBe('- a\n- [ ] b\n');
  });

  it('reports commands that cannot be applied', async () => {
    const { adapter, view } = await ready({ initialMarkdown: '```\ncode\n```\n' });
    const pm = view();
    pm.dispatch(pm.state.tr.setSelection(TextSelection.create(pm.state.doc, 2)));
    expect(adapter.runCommand('taskList')).toBe(false);
    const quote = await ready({ initialMarkdown: '> Quote\n\nAfter\n' });
    const qv = quote.view();
    qv.dispatch(
      qv.state.tr.setSelection(TextSelection.create(qv.state.doc, 3, qv.state.doc.content.size - 2)),
    );
    expect(quote.adapter.runCommand('blockquote')).toBe(false);
  });

  it('toggles block quotes', async () => {
    expect(await runOn('Quote\n', 'Quote', 'blockquote')).toBe('> Quote\n');
    expect(await runOn('> Quote\n', 'Quote', 'blockquote')).toBe('Quote\n');
  });

  it('toggles code blocks', async () => {
    expect(await runOn('code\n', 'code', 'codeBlock')).toBe('```\ncode\n```\n');
  });

  it('turns a code block back into a paragraph', async () => {
    const { adapter, view } = await ready({ initialMarkdown: '```\ncode\n```\n' });
    const pm = view();
    pm.dispatch(pm.state.tr.setSelection(TextSelection.create(pm.state.doc, 2)));
    expect(adapter.runCommand('codeBlock')).toBe(true);
    expect(adapter.getMarkdown()).toBe('code\n');
  });

  it('inserts tables and horizontal rules', async () => {
    const table = await runOn('Text\n', 'Text', 'table');
    expect(table.startsWith('Text\n\n|')).toBe(true);
    expect(table).not.toContain('<br />');
    expect(table.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(4);
    expect(await runOn('Text\n', 'Text', 'horizontalRule')).toMatch(/^Text\n\n---\n/);
    expect(await runOn('Text\n', null, 'horizontalRule')).toBe('Text\n\n---\n');
    expect(await runOn('', null, 'table')).toMatch(/^\|/);
  });

  it('opens the link editor instead of prompting', async () => {
    const { adapter, view } = await ready({ initialMarkdown: 'a word b\n' });
    selectText(view(), 'word');
    expect(adapter.runCommand('link')).toBe(true);
    expect(adapter.getMarkdown()).toBe('a word b\n');
    const linked = await ready({ initialMarkdown: 'a [word](https://x.dev) b\n' });
    selectText(linked.view(), 'word');
    expect(linked.adapter.runCommand('link')).toBe(true);
    expect(linked.adapter.getMarkdown()).toBe('a word b\n');
  });

  it('undoes and redoes edits', async () => {
    const { adapter, view } = await ready({ initialMarkdown: 'a word b\n' });
    selectText(view(), 'word');
    adapter.runCommand('bold');
    expect(adapter.undo()).toBe(true);
    expect(adapter.getMarkdown()).toBe('a word b\n');
    expect(adapter.redo()).toBe(true);
    expect(adapter.getMarkdown()).toBe('a **word** b\n');
  });

  it('scrolls to the n-th top-level heading', async () => {
    const { adapter, view } = await ready({ initialMarkdown: '# One\n\ntext\n\n> # Quoted\n\n## Two\n' });
    adapter.scrollToHeading(1);
    const pm = view();
    expect(pm.state.selection.$from.parent.textContent).toBe('Two');
    adapter.scrollToHeading(5);
    adapter.scrollToHeading(-1);
    expect(pm.state.selection.$from.parent.textContent).toBe('Two');
  });
});

describe('search integration', () => {
  it('searches the rendered document', async () => {
    const { adapter, host } = await ready({ initialMarkdown: 'alpha beta alpha\n' });
    expect(
      adapter.search.setQuery({ text: 'alpha', caseSensitive: false, wholeWord: false, regexp: false }),
    ).toEqual({
      total: 2,
      current: 1,
      error: null,
    });
    expect(host.querySelectorAll('.mpp-search-match')).toHaveLength(2);
    adapter.search.replaceAll('gamma');
    expect(adapter.getMarkdown()).toBe('gamma beta gamma\n');
  });
});

describe('front matter', () => {
  const FRONT = '---\ntitle: Hello\ntags: [a, b]\n---\n\n';

  it('keeps YAML front matter out of the document and writes it back verbatim after edits', async () => {
    const { adapter, host, view, onChange } = await ready({ initialMarkdown: `${FRONT}Body text\n` });
    expect(host.querySelector('hr')).toBeNull();
    expect(host.querySelector('h2')).toBeNull();
    const panel = host.querySelector<HTMLElement>('.mpp-front-matter');
    expect(panel?.hidden).toBe(false);
    expect(panel?.querySelector('code')?.textContent).toBe('title: Hello\ntags: [a, b]');
    expect(host.firstElementChild).toBe(panel);
    const pm = view();
    pm.dispatch(pm.state.tr.insertText('!', pm.state.doc.content.size - 1));
    expect(onChange).toHaveBeenLastCalledWith(`${FRONT}Body text!\n`);
    expect(adapter.getMarkdown()).toBe(`${FRONT}Body text!\n`);
  });

  it('updates the front matter when the content is replaced and hides the panel without it', async () => {
    const { adapter, host } = await ready({ initialMarkdown: 'No front matter\n' });
    const panel = host.querySelector<HTMLElement>('.mpp-front-matter');
    expect(panel?.hidden).toBe(true);
    adapter.setMarkdown('---\na: 1\n---\n# Title\n');
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain('a: 1');
    expect(host.querySelector('h1')?.textContent).toBe('Title');
    expect(adapter.getMarkdown()).toBe('---\na: 1\n---\n# Title\n');
    adapter.setMarkdown('Plain\n');
    expect(panel?.hidden).toBe(true);
    expect(adapter.getMarkdown()).toBe('Plain\n');
  });

  it('applies front matter set before the editor is ready and removes the panel on destroy', async () => {
    const { adapter, host } = create({ initialMarkdown: '' });
    adapter.setMarkdown('---\nk: v\n---\nText\n');
    await adapter.ready;
    expect(adapter.getMarkdown()).toBe('---\nk: v\n---\nText\n');
    adapter.destroy();
    expect(host.querySelector('.mpp-front-matter')).toBeNull();
  });

  it('keeps the caret near its position when the content is replaced', async () => {
    const { adapter, view } = await ready({ initialMarkdown: 'First paragraph\n\nSecond paragraph\n' });
    selectText(view(), 'Second');
    adapter.setMarkdown('First paragraph\n\nSecond paragraph, reloaded\n');
    expect(view().state.selection.$from.parent.textContent).toBe('Second paragraph, reloaded');
    adapter.setMarkdown('Short\n');
    expect(view().state.selection.$from.parent.textContent).toBe('Short');
  });

  it('joins front matter and body on separate lines', () => {
    expect(joinFrontMatter('', 'body')).toBe('body');
    expect(joinFrontMatter('---\na\n---', '')).toBe('---\na\n---');
    expect(joinFrontMatter('---\na\n---', 'body')).toBe('---\na\n---\nbody');
    expect(joinFrontMatter('---\na\n---\r\n', 'body')).toBe('---\na\n---\r\nbody');
  });
});

describe('math', () => {
  it('renders inline math with the bounded KaTeX options', async () => {
    const { host, adapter } = await ready({ initialMarkdown: 'Big $\\rule{99999em}{99999em}$ box\n' });
    const inline = host.querySelector<HTMLElement>('span[data-type="math_inline"]');
    expect(inline?.dataset.value).toBe('\\rule{99999em}{99999em}');
    const html = inline?.querySelector('.katex-html')?.innerHTML ?? '';
    expect(html).toContain('50em');
    expect(html).not.toContain('99999em');
    expect(adapter.getMarkdown()).toBe('Big $\\rule{99999em}{99999em}$ box\n');
  });
});

describe('list items', () => {
  it('wraps the list item node view with the selection guard', async () => {
    const { view, host } = await ready({ initialMarkdown: '- one\n- two\n' });
    expect(view().props.nodeViews?.list_item).toBeTypeOf('function');
    expect(host.querySelectorAll('.milkdown-list-item-block')).toHaveLength(2);
  });
});

describe('search subscriptions', () => {
  it('notifies subscribers when an edit changes the matches', async () => {
    const { adapter, view } = await ready({ initialMarkdown: 'alpha beta\n' });
    const listener = vi.fn();
    const unsubscribe = adapter.search.subscribe(listener);
    adapter.search.setQuery({ text: 'alpha', caseSensitive: false, wholeWord: false, regexp: false });
    const pm = view();
    pm.dispatch(pm.state.tr.insertText(' alpha', pm.state.doc.content.size - 1));
    expect(listener).toHaveBeenLastCalledWith({ total: 2, current: 1, error: null });
    unsubscribe();
    listener.mockClear();
    pm.dispatch(pm.state.tr.insertText(' alpha', pm.state.doc.content.size - 1));
    expect(listener).not.toHaveBeenCalled();
  });
});
