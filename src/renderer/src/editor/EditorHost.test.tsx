import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorMode } from '@shared/types';
import { EditorHost, type EditorHostProps } from './EditorHost';
import type { EditorAdapter, EditorCallbacks, EditorOptions } from './types';

interface FakeEditor {
  readonly adapter: EditorAdapter;
  readonly host: HTMLElement;
  readonly options: EditorOptions;
  readonly callbacks: EditorCallbacks;
  markdown: string;
  resolve(): void;
  reject(error: unknown): void;
}

const created: FakeEditor[] = [];

function fakeFactory(mode: EditorMode) {
  return (host: HTMLElement, options: EditorOptions, callbacks: EditorCallbacks): EditorAdapter => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const ready = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const fake: FakeEditor = {
      host,
      options,
      callbacks,
      markdown: options.initialMarkdown,
      resolve: () => resolve(),
      reject: (error) => reject(error),
      adapter: {
        mode,
        ready,
        getMarkdown: vi.fn(() => fake.markdown),
        setMarkdown: vi.fn((markdown: string) => {
          fake.markdown = markdown;
        }),
        focus: vi.fn(),
        runCommand: vi.fn(() => true),
        undo: vi.fn(() => true),
        redo: vi.fn(() => false),
        scrollToHeading: vi.fn(),
        updateOptions: vi.fn(),
        search: {
          setQuery: vi.fn(() => ({ total: 0, current: 0, error: null })),
          findNext: vi.fn(() => ({ total: 0, current: 0, error: null })),
          findPrevious: vi.fn(() => ({ total: 0, current: 0, error: null })),
          replaceCurrent: vi.fn(() => ({ total: 0, current: 0, error: null })),
          replaceAll: vi.fn(() => ({ total: 0, current: 0, error: null })),
          clear: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        destroy: vi.fn(),
      },
    };
    created.push(fake);
    return fake.adapter;
  };
}

vi.mock('./wysiwyg', () => ({ createWysiwygEditor: fakeFactory('wysiwyg') }));
vi.mock('./source', () => ({ createSourceEditor: fakeFactory('source') }));

const options: EditorHostProps['options'] = {
  spellcheck: true,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  loadRemoteImages: true,
  placeholder: 'Write…',
};

function props(overrides: Partial<EditorHostProps> = {}): EditorHostProps {
  return {
    docId: 'doc-1',
    mode: 'wysiwyg',
    initialMarkdown: '# Original\n',
    revision: 0,
    documentPath: '/a/readme.md',
    options,
    active: true,
    onChange: vi.fn(),
    onCursorChange: vi.fn(),
    onAdapter: vi.fn(),
    ...overrides,
  };
}

const last = (): FakeEditor => {
  const fake = created.at(-1);
  if (fake === undefined) throw new Error('no editor created');
  return fake;
};

async function settle(fake: FakeEditor): Promise<void> {
  await act(async () => {
    fake.resolve();
    await fake.adapter.ready;
  });
}

beforeEach(() => {
  created.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditorHost', () => {
  it('mounts the editor of the requested mode with the document options', async () => {
    const p = props();
    const { container } = render(<EditorHost {...p} />);
    const fake = last();
    expect(fake.adapter.mode).toBe('wysiwyg');
    expect(fake.options).toEqual({
      ...options,
      documentPath: '/a/readme.md',
      initialMarkdown: '# Original\n',
    });
    const host = container.querySelector('.mpp-editor-host');
    expect(host?.getAttribute('data-mode')).toBe('wysiwyg');
    expect(host?.getAttribute('data-doc-id')).toBe('doc-1');
    expect(fake.host.parentElement).toBe(host);
    expect(fake.host.className).toBe('mpp-editor-mount');
    expect(p.onAdapter).not.toHaveBeenCalled();
    await settle(fake);
    expect(p.onAdapter).toHaveBeenCalledTimes(1);
  });

  it('hands out a tracking wrapper that delegates to the adapter', async () => {
    const p = props();
    render(<EditorHost {...p} />);
    const fake = last();
    await settle(fake);
    const wrapper = vi.mocked(p.onAdapter).mock.calls[0]?.[1];
    if (wrapper === null || wrapper === undefined) throw new Error('no adapter');
    expect(wrapper.mode).toBe('wysiwyg');
    expect(wrapper.search).toBe(fake.adapter.search);
    await expect(wrapper.ready).resolves.toBeUndefined();
    wrapper.focus();
    expect(wrapper.runCommand('bold')).toBe(true);
    expect(wrapper.undo()).toBe(true);
    expect(wrapper.redo()).toBe(false);
    wrapper.scrollToHeading(2);
    wrapper.updateOptions({ spellcheck: false });
    wrapper.setMarkdown('new');
    expect(wrapper.getMarkdown()).toBe('new');
    wrapper.destroy();
    expect(fake.adapter.focus).toHaveBeenCalled();
    expect(fake.adapter.runCommand).toHaveBeenCalledWith('bold');
    expect(fake.adapter.scrollToHeading).toHaveBeenCalledWith(2);
    expect(fake.adapter.updateOptions).toHaveBeenCalledWith({ spellcheck: false });
    expect(fake.adapter.destroy).toHaveBeenCalled();
  });

  it('returns the loaded markdown verbatim until the user edits it', async () => {
    const p = props();
    render(<EditorHost {...p} />);
    const fake = last();
    await settle(fake);
    const wrapper = vi.mocked(p.onAdapter).mock.calls[0]?.[1];
    if (wrapper === null || wrapper === undefined) throw new Error('no adapter');
    fake.markdown = '# Normalised\n';
    const calls = vi.mocked(fake.adapter.getMarkdown).mock.calls.length;
    expect(wrapper.getMarkdown()).toBe('# Original\n');
    expect(fake.adapter.getMarkdown).toHaveBeenCalledTimes(calls);
    fake.callbacks.onChange('# Edited\n');
    fake.markdown = '# Edited and serialised\n';
    expect(wrapper.getMarkdown()).toBe('# Edited and serialised\n');
    wrapper.setMarkdown('# Reloaded\n');
    fake.markdown = '# Reloaded, normalised\n';
    expect(wrapper.getMarkdown()).toBe('# Reloaded\n');
  });

  it('hides inactive documents without unmounting them', () => {
    const p = props({ active: false });
    const { container, rerender } = render(<EditorHost {...p} />);
    const host = container.querySelector<HTMLElement>('.mpp-editor-host');
    expect(host?.style.display).toBe('none');
    expect(host?.getAttribute('aria-hidden')).toBe('true');
    rerender(<EditorHost {...p} active />);
    expect(host?.style.display).toBe('');
    expect(host?.hasAttribute('aria-hidden')).toBe(false);
    expect(created).toHaveLength(1);
  });

  it('forwards changes and cursor updates with the document id', () => {
    const p = props();
    render(<EditorHost {...p} />);
    const fake = last();
    fake.callbacks.onChange('changed');
    fake.callbacks.onCursorChange?.({ line: 2, column: 3, selectionLength: 0 });
    expect(p.onChange).toHaveBeenCalledWith('doc-1', 'changed');
    expect(p.onCursorChange).toHaveBeenCalledWith('doc-1', { line: 2, column: 3, selectionLength: 0 });
  });

  it('uses the latest callbacks without remounting', () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const onChange = vi.fn();
    rerender(<EditorHost {...p} onChange={onChange} />);
    last().callbacks.onChange('x');
    expect(onChange).toHaveBeenCalledWith('doc-1', 'x');
    expect(created).toHaveLength(1);
  });

  it('reuses the unmodified markdown verbatim when switching modes', async () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const first = last();
    await settle(first);
    first.markdown = '# Normalised\n';
    const calls = vi.mocked(first.adapter.getMarkdown).mock.calls.length;
    rerender(<EditorHost {...p} mode="source" />);
    expect(first.adapter.destroy).toHaveBeenCalled();
    expect(first.adapter.getMarkdown).toHaveBeenCalledTimes(calls);
    expect(p.onAdapter).toHaveBeenLastCalledWith('doc-1', null);
    const second = last();
    expect(second.adapter.mode).toBe('source');
    expect(second.options.initialMarkdown).toBe('# Original\n');
    await settle(second);
    expect(p.onAdapter).toHaveBeenLastCalledWith('doc-1', expect.objectContaining({ mode: 'source' }));
  });

  it('serialises the edited document when switching modes', () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const first = last();
    first.callbacks.onChange('# Edited\n');
    first.markdown = '# Edited and serialised\n';
    rerender(<EditorHost {...p} mode="source" />);
    expect(last().options.initialMarkdown).toBe('# Edited and serialised\n');
  });

  it('falls back to the last reported markdown when serialisation fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const first = last();
    first.callbacks.onChange('# Reported\n');
    vi.mocked(first.adapter.getMarkdown).mockImplementation(() => {
      throw new Error('boom');
    });
    rerender(<EditorHost {...p} mode="source" />);
    expect(last().options.initialMarkdown).toBe('# Reported\n');
    expect(error).toHaveBeenCalledWith('Failed to serialise the editor content', expect.any(Error));
  });

  it('remembers content replaced through setMarkdown for the next mount', async () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const first = last();
    first.callbacks.onChange('# Edited\n');
    await settle(first);
    const wrapper = vi.mocked(p.onAdapter).mock.calls[0]?.[1];
    wrapper?.setMarkdown('# Reloaded from disk\n');
    first.markdown = '# Should not be used\n';
    rerender(<EditorHost {...p} mode="source" />);
    expect(last().options.initialMarkdown).toBe('# Reloaded from disk\n');
  });

  it('reports the original markdown when an edit returns to the normalised loaded content', async () => {
    const p = props({ initialMarkdown: '* one\n' });
    render(<EditorHost {...p} />);
    const fake = last();
    fake.markdown = '- one\n';
    await settle(fake);
    const wrapper = vi.mocked(p.onAdapter).mock.calls[0]?.[1];
    if (wrapper === null || wrapper === undefined) throw new Error('no adapter');
    fake.callbacks.onChange('- onex\n');
    expect(p.onChange).toHaveBeenLastCalledWith('doc-1', '- onex\n');
    fake.callbacks.onChange('- one\n');
    expect(p.onChange).toHaveBeenLastCalledWith('doc-1', '* one\n');
    expect(wrapper.getMarkdown()).toBe('* one\n');
  });

  it('takes a new baseline when content is replaced through setMarkdown', async () => {
    const p = props({ initialMarkdown: '* one\n' });
    render(<EditorHost {...p} />);
    const fake = last();
    const wrapperBeforeReady = (): void => {
      // Before `ready` there is no baseline yet: edits are reported as they are.
      fake.callbacks.onChange('+ early\n');
      expect(p.onChange).toHaveBeenLastCalledWith('doc-1', '+ early\n');
    };
    wrapperBeforeReady();
    fake.markdown = '- one\n';
    await settle(fake);
    const wrapper = vi.mocked(p.onAdapter).mock.calls[0]?.[1];
    if (wrapper === null || wrapper === undefined) throw new Error('no adapter');
    vi.mocked(fake.adapter.setMarkdown).mockImplementation((markdown) => {
      fake.markdown = markdown.replace('*', '-');
    });
    wrapper.setMarkdown('* two\n');
    fake.callbacks.onChange('- twox\n');
    fake.callbacks.onChange('- two\n');
    expect(p.onChange).toHaveBeenLastCalledWith('doc-1', '* two\n');
  });

  it('replaces the content of the live editor when the revision changes', async () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const fake = last();
    await settle(fake);
    fake.callbacks.onChange('# Edited\n');
    rerender(<EditorHost {...p} initialMarkdown={'# From disk\n'} />);
    expect(fake.adapter.setMarkdown).not.toHaveBeenCalled();
    rerender(<EditorHost {...p} initialMarkdown={'# From disk\n'} revision={1} />);
    expect(fake.adapter.setMarkdown).toHaveBeenCalledWith('# From disk\n');
    expect(created).toHaveLength(1);
    expect(fake.adapter.destroy).not.toHaveBeenCalled();
    const wrapper = vi.mocked(p.onAdapter).mock.calls[0]?.[1];
    fake.markdown = '# From disk, normalised\n';
    expect(wrapper?.getMarkdown()).toBe('# From disk\n');
  });

  it('takes the baseline of content reloaded before the editor was ready once it is', async () => {
    const p = props({ initialMarkdown: '* one\n' });
    const { rerender } = render(<EditorHost {...p} />);
    const fake = last();
    rerender(<EditorHost {...p} initialMarkdown={'* reloaded\n'} revision={1} />);
    expect(fake.adapter.setMarkdown).toHaveBeenCalledWith('* reloaded\n');
    fake.markdown = '- reloaded\n';
    await settle(fake);
    fake.callbacks.onChange('- reloadedx\n');
    fake.callbacks.onChange('- reloaded\n');
    expect(p.onChange).toHaveBeenLastCalledWith('doc-1', '* reloaded\n');
  });

  it('moves keyboard focus to the new editor after a mode switch', async () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const first = last();
    await settle(first);
    const editable = document.createElement('div');
    editable.tabIndex = 0;
    first.host.append(editable);
    editable.focus();
    rerender(<EditorHost {...p} mode="source" />);
    const second = last();
    expect(second.adapter.focus).not.toHaveBeenCalled();
    await settle(second);
    expect(second.adapter.focus).toHaveBeenCalledTimes(1);
    // Only once: a later switch without focus in the editor does not steal focus.
    rerender(<EditorHost {...p} mode="wysiwyg" />);
    const third = last();
    await settle(third);
    expect(third.adapter.focus).not.toHaveBeenCalled();
  });

  it('does not focus the new editor of an inactive document', async () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const first = last();
    await settle(first);
    const editable = document.createElement('input');
    first.host.append(editable);
    editable.focus();
    rerender(<EditorHost {...p} mode="source" active={false} />);
    const second = last();
    await settle(second);
    expect(second.adapter.focus).not.toHaveBeenCalled();
  });

  it('applies only changed options to the live adapter', () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    const fake = last();
    rerender(<EditorHost {...p} options={{ ...options }} />);
    expect(fake.adapter.updateOptions).not.toHaveBeenCalled();
    rerender(<EditorHost {...p} options={{ ...options, lineNumbers: false, tabSize: 4 }} />);
    expect(fake.adapter.updateOptions).toHaveBeenLastCalledWith({ lineNumbers: false, tabSize: 4 });
    rerender(
      <EditorHost {...p} options={{ ...options, lineNumbers: false, tabSize: 4 }} documentPath="/b/x.md" />,
    );
    expect(fake.adapter.updateOptions).toHaveBeenLastCalledWith({ documentPath: '/b/x.md' });
    expect(created).toHaveLength(1);
  });

  it('mounts a new editor with the current options after a mode switch', () => {
    const p = props();
    const { rerender } = render(<EditorHost {...p} />);
    rerender(<EditorHost {...p} options={{ ...options, wordWrap: false }} />);
    rerender(<EditorHost {...p} options={{ ...options, wordWrap: false }} mode="source" />);
    const second = last();
    expect(second.options.wordWrap).toBe(false);
    rerender(<EditorHost {...p} options={{ ...options, wordWrap: false }} mode="source" />);
    expect(second.adapter.updateOptions).not.toHaveBeenCalled();
  });

  it('destroys the editor and unregisters it on unmount', async () => {
    const p = props();
    const { unmount, container } = render(<EditorHost {...p} />);
    const fake = last();
    await settle(fake);
    unmount();
    expect(fake.adapter.destroy).toHaveBeenCalledTimes(1);
    expect(p.onAdapter).toHaveBeenLastCalledWith('doc-1', null);
    expect(container.querySelector('.mpp-editor-mount')).toBeNull();
  });

  it('ignores a late ready and callbacks after unmount', async () => {
    const p = props();
    const { unmount } = render(<EditorHost {...p} />);
    const fake = last();
    unmount();
    await settle(fake);
    fake.callbacks.onChange('late');
    fake.callbacks.onCursorChange?.({ line: 1, column: 1, selectionLength: 0 });
    expect(p.onAdapter).toHaveBeenCalledTimes(1);
    expect(p.onAdapter).toHaveBeenCalledWith('doc-1', null);
    expect(p.onChange).not.toHaveBeenCalled();
    expect(p.onCursorChange).not.toHaveBeenCalled();
  });

  it('is safe under StrictMode double mounting', async () => {
    const p = props();
    render(
      <StrictMode>
        <EditorHost {...p} />
      </StrictMode>,
    );
    expect(created).toHaveLength(2);
    const [first, second] = created;
    expect(first?.adapter.destroy).toHaveBeenCalledTimes(1);
    expect(second?.adapter.destroy).not.toHaveBeenCalled();
    await settle(first!);
    await settle(second!);
    const registered = vi.mocked(p.onAdapter).mock.calls.filter(([, adapter]) => adapter !== null);
    expect(registered).toHaveLength(1);
    expect(document.querySelectorAll('.mpp-editor-mount')).toHaveLength(1);
  });

  it('logs editors that fail to start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = props({ mode: 'source' });
    const { unmount } = render(<EditorHost {...p} />);
    const fake = last();
    await act(async () => {
      fake.reject(new Error('no'));
      await fake.adapter.ready.catch(() => undefined);
    });
    expect(error).toHaveBeenCalledWith('Failed to start the source editor', expect.any(Error));
    expect(p.onAdapter).not.toHaveBeenCalled();
    unmount();
  });

  it('does not log failures of editors that were already unmounted', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<EditorHost {...props()} />);
    const fake = last();
    unmount();
    await act(async () => {
      fake.reject(new Error('late'));
      await fake.adapter.ready.catch(() => undefined);
    });
    expect(error).not.toHaveBeenCalled();
  });
});
