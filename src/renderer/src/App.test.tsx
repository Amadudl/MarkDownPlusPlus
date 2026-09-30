import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandId } from '@shared/commands';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { fakeAdapters } from '@renderer/test/fakeEditor';
import { flush, resetApp, setSettings } from '@renderer/test/utils';
import { App } from './App';
import { selectActiveDocument, useDocuments } from './store/documents';
import { useUi } from './store/ui';

vi.mock('@renderer/editor/EditorHost', () => import('@renderer/test/fakeEditor'));

const docs = useDocuments.getState;

describe('App', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/notes/a.md', '# Alpha\n\n## Beta\n\nSome words here.\n')]);
  });

  it('starts on the welcome screen and opens the tutorial', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'MarkDown++' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open the tutorial/ }));
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Welcome to MarkDown++' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Visual' })).toHaveAttribute('aria-checked', 'true');
  });

  it('restores the session, edits, switches mode and saves through the menu', async () => {
    const user = userEvent.setup();
    api.state.session = { documents: [{ path: '/notes/a.md', mode: 'wysiwyg' }], activePath: '/notes/a.md' };
    render(<App />);
    const tab = await screen.findByRole('tab', { name: 'a.md' });
    expect(tab).toBeInTheDocument();
    await vi.waitFor(() => expect(document.title).toBe('a.md — MarkDown++'));
    const id = docs().activeId!;
    act(() => fakeAdapters.get(id)!.type('# Alpha\n\nchanged'));
    expect(screen.getByRole('tab', { name: /a\.md/ })).toHaveClass('is-dirty');
    await vi.waitFor(() => expect(api.app.setDirty).toHaveBeenLastCalledWith(true));
    await user.click(screen.getByRole('radio', { name: 'Markdown' }));
    expect(screen.getByTestId(`editor-${id}`)).toHaveAttribute('data-mode', 'source');
    act(() => api.emit.menuCommand(CommandId.FileSave));
    await vi.waitFor(() => expect(api.state.files.get('/notes/a.md')?.content).toBe('# Alpha\n\nchanged'));
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows the outline, focus mode and hides the status bar by setting', async () => {
    const user = userEvent.setup();
    api.state.pending = [fakeFile('/notes/a.md', '# Alpha\n\n## Beta\n')];
    render(<App />);
    await screen.findByRole('tab', { name: 'a.md' });
    act(() => api.emit.menuCommand(CommandId.ViewToggleOutline));
    const outline = await screen.findByRole('complementary', { name: 'Outline' });
    expect(
      within(outline)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toContain('Beta');
    act(() => api.emit.menuCommand(CommandId.ViewToggleFocusMode));
    await vi.waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
    expect(screen.queryByRole('complementary', { name: 'Outline' })).not.toBeInTheDocument();
    expect(document.querySelector('.app')).toHaveClass('is-focus-mode');
    await user.click(screen.getByRole('button', { name: 'Exit focus mode' }));
    expect(useUi.getState().focusMode).toBe(false);
    act(() => setSettings(api, { general: { showStatusBar: false } }));
    expect(screen.queryByRole('contentinfo', { name: 'Status bar' })).not.toBeInTheDocument();
  });

  it('opens the palette, settings, shortcuts and about dialogs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'MarkDown++' });
    act(() => api.emit.menuCommand(CommandId.ViewCommandPalette));
    const combobox = await screen.findByRole('combobox', { name: 'Search commands and recent files' });
    await user.type(combobox, 'keyboard shortcuts{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    act(() => api.emit.menuCommand(CommandId.SettingsOpen));
    expect(await screen.findByRole('tablist', { name: 'Settings sections' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    act(() => api.emit.menuCommand(CommandId.HelpAbout));
    expect(await screen.findByText(/Non-commercial license/)).toBeInTheDocument();
  });

  it('asks about unsaved documents when the window closes', async () => {
    api.state.pending = [fakeFile('/notes/a.md', 'A')];
    render(<App />);
    await screen.findByRole('tab', { name: 'a.md' });
    act(() => fakeAdapters.get(docs().activeId!)!.type('dirty'));
    api.state.unsavedChoice = 'cancel';
    act(() => api.emit.closeRequested());
    await vi.waitFor(() => expect(api.app.confirmUnsaved).toHaveBeenCalledWith('a.md'));
    await flush();
    expect(api.app.closeReady).not.toHaveBeenCalled();
    api.state.unsavedChoice = 'discard';
    act(() => api.emit.closeRequested());
    await vi.waitFor(() => expect(api.app.closeReady).toHaveBeenCalledTimes(1));
    expect(api.state.session).toEqual({
      documents: [{ path: '/notes/a.md', mode: 'wysiwyg' }],
      activePath: '/notes/a.md',
    });
  });

  it('reloads clean files changed on disk and flags dirty ones', async () => {
    api.state.pending = [fakeFile('/notes/a.md', 'A', { mtimeMs: 1 })];
    render(<App />);
    await screen.findByRole('tab', { name: 'a.md' });
    api.state.files.set('/notes/a.md', fakeFile('/notes/a.md', 'from disk', { mtimeMs: 2 }));
    act(() => api.emit.fileChanged({ path: '/notes/a.md', kind: 'changed', mtimeMs: 2 }));
    await vi.waitFor(() => expect(selectActiveDocument(docs())?.content).toBe('from disk'));
    act(() => fakeAdapters.get(docs().activeId!)!.type('mine'));
    act(() => api.emit.fileChanged({ path: '/notes/a.md', kind: 'changed', mtimeMs: 3 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed on disk');
  });

  it('opens the find bar from the menu', async () => {
    api.state.pending = [fakeFile('/notes/a.md', 'A')];
    render(<App />);
    await screen.findByRole('tab', { name: 'a.md' });
    act(() => api.emit.menuCommand(CommandId.EditReplace));
    expect(await screen.findByRole('search', { name: 'Find and replace' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Replace' })).toBeInTheDocument();
  });

  it('shows the drop overlay', () => {
    render(<App />);
    act(() => useUi.getState().setDropActive(true));
    expect(screen.getByText('Drop Markdown files to open them')).toBeInTheDocument();
  });
});
