import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { fakeAdapters } from '@renderer/test/fakeEditor';
import { resetApp, setSettings } from '@renderer/test/utils';
import { getAdapter } from '@renderer/store/adapters';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { EditorArea } from './EditorArea';
import { LEGACY_DEFAULT_SOURCE_FONT } from './settings/SourceFontField';

vi.mock('@renderer/editor/EditorHost', () => import('@renderer/test/fakeEditor'));

const docs = useDocuments.getState;

describe('EditorArea', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A2', { mtimeMs: 7 })]);
  });

  it('mounts one editor per document and shows only the active one', () => {
    const a = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    const b = docs().newDocument({ mode: 'source', lineEnding: 'lf' });
    render(<EditorArea />);
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(2);
    expect(panels[0]).not.toBeVisible();
    expect(panels[1]).toBeVisible();
    expect(panels[1]).toHaveAttribute('data-mode', 'source');
    expect(screen.getByTestId(`editor-${a}`)).toHaveAttribute('data-active', 'false');
    expect(getAdapter(b)).toBe(fakeAdapters.get(b));
    expect(useUi.getState().cursors[b]).toEqual({ line: 1, column: 1, selectionLength: 0 });
  });

  it('writes edits into the store and passes editor options and fonts', () => {
    const api2 = api;
    setSettings(api2, { editor: { sourceFontFamily: 'Fira Code', sourceFontSize: 16 } });
    const id = docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const { container } = render(<EditorArea />);
    act(() => fakeAdapters.get(id)!.type('# typed'));
    expect(docs().documents[0]?.content).toBe('# typed');
    const area = container.querySelector<HTMLElement>('.editor-area')!;
    expect(area.style.getPropertyValue('--mpp-source-font-family')).toBe('Fira Code');
    expect(area.style.getPropertyValue('--mpp-source-font-size')).toBe('16px');
  });

  it('renders the 1.0.0 default source font with the bundled font', () => {
    setSettings(api, { editor: { sourceFontFamily: LEGACY_DEFAULT_SOURCE_FONT } });
    docs().newDocument({ mode: 'source', lineEnding: 'lf' });
    const { container } = render(<EditorArea />);
    const area = container.querySelector<HTMLElement>('.editor-area')!;
    expect(area.style.getPropertyValue('--mpp-source-font-family')).toContain('JetBrains Mono Variable');
  });

  it('remounts the editor on mode switches and reloads content into the live editor', () => {
    const id = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    render(<EditorArea />);
    const first = fakeAdapters.get(id)!;
    act(() => docs().setMode(id, 'source'));
    const second = fakeAdapters.get(id)!;
    expect(first.destroyed).toBe(true);
    expect(second.mode).toBe('source');
    act(() => docs().reloadFromDisk(id, fakeFile('/a.md', 'fresh')));
    // The editor instance (and with it focus, scroll position and undo history) survives a reload.
    expect(second.destroyed).toBe(false);
    expect(fakeAdapters.get(id)).toBe(second);
    expect(second.markdown).toBe('fresh');
  });

  it('shows the external change banner for changed files', async () => {
    const id = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    act(() => {
      docs().updateContent(id, 'mine');
      docs().setExternalChange(id, 'changed');
    });
    render(<EditorArea />);
    expect(screen.getByRole('alert')).toHaveTextContent('a.md was changed on disk');
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(docs().documents[0]?.content).toBe('mine');
    act(() => docs().setExternalChange(id, 'changed'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload from disk' }));
    await vi.waitFor(() => expect(docs().documents[0]?.content).toBe('A2'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the banner for deleted files', async () => {
    const id = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    docs().activate(id);
    act(() => docs().setExternalChange(id, 'deleted'));
    render(<EditorArea />);
    expect(screen.getByRole('alert')).toHaveTextContent('was deleted or moved on disk');
    await userEvent.click(screen.getByRole('button', { name: 'Keep as unsaved' }));
    expect(docs().documents[0]).toMatchObject({ externalChange: 'none', diskMissing: true });
    act(() => docs().setExternalChange(id, 'deleted'));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(docs().documents).toHaveLength(1));
  });

  it('asks before the deleted-file banner closes a document with unsaved edits', async () => {
    const id = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    act(() => {
      docs().updateContent(id, 'my unsaved edit');
      docs().setExternalChange(id, 'deleted');
    });
    api.state.unsavedChoice = 'cancel';
    render(<EditorArea />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(api.app.confirmUnsaved).toHaveBeenCalledWith('a.md'));
    expect(docs().documents).toHaveLength(1);
    expect(docs().documents[0]?.content).toBe('my unsaved edit');
    api.state.unsavedChoice = 'discard';
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(docs().documents).toHaveLength(0));
  });
});
