import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp } from '@renderer/test/utils';
import { TUTORIAL_TITLE } from '@renderer/commands/documentActions';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { WelcomeScreen } from './WelcomeScreen';

const docs = useDocuments.getState;

describe('WelcomeScreen', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/docs/notes.md', 'N')]);
  });

  it('offers new, open and tutorial actions with shortcuts', async () => {
    const user = userEvent.setup();
    api.state.openDialogResult = [fakeFile('/docs/picked.md')];
    render(<WelcomeScreen />);
    expect(screen.getByRole('heading', { name: 'MarkDown++' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New document/ })).toHaveTextContent('Ctrl+N');
    await user.click(screen.getByRole('button', { name: /New document/ }));
    expect(selectActiveDocument(docs())?.title).toBe('Untitled-1');
    await user.click(screen.getByRole('button', { name: /Open file/ }));
    await vi.waitFor(() => expect(selectActiveDocument(docs())?.path).toBe('/docs/picked.md'));
    await user.click(screen.getByRole('button', { name: /Open the tutorial/ }));
    expect(selectActiveDocument(docs())?.title).toBe(TUTORIAL_TITLE);
    expect(screen.getByText('Command palette')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
  });

  it('lists shortcut hints as plain text, not as buttons', () => {
    render(<WelcomeScreen />);
    const list = screen.getByRole('heading', { name: 'Good to know' }).nextElementSibling as HTMLElement;
    expect(within(list).queryAllByRole('button')).toEqual([]);
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Command paletteCtrl+Shift+P',
      'Visual / MarkdownCtrl+E',
      'Settings & themesCtrl+,',
      'All shortcutsCtrl+/',
      'Drop .md files anywhere to open them',
    ]);
    expect(screen.getByText('Drop .md files anywhere to open them')).toHaveClass('welcome-hint-note');
  });

  it('lists recent files and opens them', async () => {
    api.state.recent = [{ path: '/docs/notes.md', openedAt: 1 }];
    render(<WelcomeScreen />);
    const item = await screen.findByRole('button', { name: /notes\.md/ });
    expect(item).toHaveAttribute('title', '/docs/notes.md');
    await userEvent.click(item);
    await vi.waitFor(() => expect(selectActiveDocument(docs())?.content).toBe('N'));
  });

  it('toggles the startup preference', async () => {
    render(<WelcomeScreen />);
    const checkbox = screen.getByRole('checkbox', { name: /Show this screen/ });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    await vi.waitFor(() => expect(useSettings.getState().settings.general.showWelcome).toBe(false));
  });

  it('reports recent-file errors and ignores results after unmount', async () => {
    vi.mocked(api.recent.get).mockRejectedValueOnce(new Error('x'));
    const { unmount } = render(<WelcomeScreen />);
    await vi.waitFor(() => expect(useUi.getState().toasts[0]?.message).toBe('Could not load recent files.'));
    unmount();
    let resolve: (value: { path: string; openedAt: number }[]) => void = () => undefined;
    vi.mocked(api.recent.get).mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    render(<WelcomeScreen />).unmount();
    resolve([{ path: '/late.md', openedAt: 1 }]);
    await Promise.resolve();
    expect(screen.queryByText('late.md')).not.toBeInTheDocument();
  });
});
