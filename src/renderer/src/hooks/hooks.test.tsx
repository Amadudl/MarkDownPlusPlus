import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandId } from '@shared/commands';
import type { Settings } from '@shared/settings';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { createFakeAdapter } from '@renderer/test/fakeEditor';
import { flush, resetApp } from '@renderer/test/utils';
import { setAdapter } from '@renderer/store/adapters';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { useActiveAdapter } from './useActiveAdapter';
import { useActiveDocument } from './useActiveDocument';
import { useAppLifecycle } from './useAppLifecycle';
import { openDroppedFiles, useFileDrop } from './useFileDrop';

const docs = useDocuments.getState;

function dragEvent(type: string, files: File[] | null): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const transfer =
    files === null ? { types: ['text/plain'], files: [] } : { types: ['Files'], files, dropEffect: 'none' };
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return event;
}

describe('useActiveDocument / useActiveAdapter', () => {
  beforeEach(() => {
    resetApp();
  });

  it('follow the active document and its adapter', () => {
    const { result } = renderHook(() => ({ doc: useActiveDocument(), adapter: useActiveAdapter() }));
    expect(result.current).toEqual({ doc: undefined, adapter: undefined });
    let id = '';
    act(() => {
      id = docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    });
    expect(result.current.doc?.id).toBe(id);
    const adapter = createFakeAdapter('wysiwyg', '');
    act(() => setAdapter(id, adapter));
    expect(result.current.adapter).toBe(adapter);
  });
});

describe('useFileDrop', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/dropped/a.md', 'A')]);
  });

  it('opens dropped markdown files and warns about others', async () => {
    await expect(
      openDroppedFiles([new File(['x'], 'a.md'), new File(['x'], 'b.png'), new File(['x'], 'c.jpg')]),
    ).resolves.toBe(2);
    expect(selectActiveDocument(docs())?.path).toBe('/dropped/a.md');
    expect(useUi.getState().toasts.at(-1)?.message).toBe('2 files are not markdown files.');
    vi.mocked(api.file.pathForDroppedFile).mockReturnValueOnce('');
    await expect(openDroppedFiles([new File(['x'], 'virtual.md')])).resolves.toBe(1);
    expect(useUi.getState().toasts.at(-1)?.message).toBe('One file is not a markdown file.');
    const count = useUi.getState().toasts.length;
    await expect(openDroppedFiles([])).resolves.toBe(0);
    expect(useUi.getState().toasts).toHaveLength(count);
  });

  it('shows the overlay while dragging files and opens them on drop', async () => {
    const { unmount } = renderHook(() => useFileDrop());
    const file = new File(['x'], 'a.md');
    window.dispatchEvent(dragEvent('dragenter', [file]));
    window.dispatchEvent(dragEvent('dragenter', [file]));
    expect(useUi.getState().dropActive).toBe(true);
    const over = dragEvent('dragover', [file]);
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    window.dispatchEvent(dragEvent('dragleave', [file]));
    expect(useUi.getState().dropActive).toBe(true);
    window.dispatchEvent(dragEvent('dragleave', [file]));
    expect(useUi.getState().dropActive).toBe(false);
    window.dispatchEvent(dragEvent('dragleave', [file]));
    window.dispatchEvent(dragEvent('dragenter', [file]));
    const drop = dragEvent('drop', [file]);
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(useUi.getState().dropActive).toBe(false);
    await vi.waitFor(() => expect(selectActiveDocument(docs())?.path).toBe('/dropped/a.md'));
    unmount();
    window.dispatchEvent(dragEvent('dragenter', [file]));
    expect(useUi.getState().dropActive).toBe(false);
  });

  it('ignores drags without files (e.g. tabs or text)', () => {
    renderHook(() => useFileDrop());
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
      const event = dragEvent(type, null);
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(useUi.getState().dropActive).toBe(false);
  });

  it('handles events without a dataTransfer object', () => {
    renderHook(() => useFileDrop());
    const event = new Event('dragover', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('tolerates a files drag whose dataTransfer disappears', () => {
    renderHook(() => useFileDrop());
    const over = new Event('dragover', { cancelable: true });
    let reads = 0;
    Object.defineProperty(over, 'dataTransfer', {
      get: () => {
        reads += 1;
        return reads === 1 ? { types: ['Files'] } : null;
      },
    });
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop = new Event('drop', { cancelable: true });
    let dropReads = 0;
    Object.defineProperty(drop, 'dataTransfer', {
      get: () => {
        dropReads += 1;
        return dropReads === 1 ? { types: ['Files'] } : null;
      },
    });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
  });
});

describe('useAppLifecycle', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A')]);
    api.state.pending = [fakeFile('/a.md', 'A')];
  });

  it('wires everything up once and tears it down', async () => {
    const { unmount, rerender } = renderHook(() => useAppLifecycle());
    await vi.waitFor(() => expect(selectActiveDocument(docs())?.path).toBe('/a.md'));
    rerender();
    expect(api.app.takePendingFiles).toHaveBeenCalledTimes(1);
    expect(document.body).toHaveClass('platform-linux');
    expect(api.file.watch).toHaveBeenCalledWith('/a.md');
    api.emit.menuCommand(CommandId.HelpAbout);
    await vi.waitFor(() => expect(useUi.getState().dialog).toBe('about'));
    act(() => useUi.getState().setPlatform('darwin'));
    expect(document.body).toHaveClass('platform-darwin');
    unmount();
    expect(api.listenerCounts()).toEqual({
      menu: 0,
      openFiles: 0,
      fileChanged: 0,
      closeRequested: 0,
      settingsChanged: 0,
    });
  });

  it('reports a failing startup', async () => {
    // A malformed settings object makes the startup sequence itself throw.
    vi.mocked(api.settings.get).mockResolvedValueOnce({} as Settings);
    renderHook(() => useAppLifecycle());
    await flush();
    expect(useUi.getState().toasts.map((toast) => toast.message)).toContain('Startup failed.');
  });

  it('renders inside a component tree', () => {
    function Probe(): React.JSX.Element {
      useAppLifecycle();
      return <p>ok</p>;
    }
    render(<Probe />);
    expect(screen.getByText('ok')).toBeInTheDocument();
    fireEvent(window, new Event('blur'));
  });
});
