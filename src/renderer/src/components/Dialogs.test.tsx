import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeApi } from '@renderer/test/fakeApi';
import { FAKE_APP_INFO } from '@renderer/test/fakeApi';
import { resetApp } from '@renderer/test/utils';
import { registerDefaultCommands } from '@renderer/commands';
import { useUi } from '@renderer/store/ui';
import { AboutDialog } from './AboutDialog';
import { DropOverlay } from './DropOverlay';
import { PROJECT_LINKS } from './links';
import { EDITOR_HINTS, formatHintKeys, ShortcutsDialog } from './ShortcutsDialog';
import { Toasts } from './Toasts';

describe('ShortcutsDialog', () => {
  beforeEach(() => {
    resetApp();
    registerDefaultCommands();
  });

  it('lists shortcuts by category with editor hints and filters them', async () => {
    const user = userEvent.setup();
    useUi.setState({ dialog: 'shortcuts', platform: 'darwin' });
    render(<ShortcutsDialog />);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'File' })).toHaveTextContent('⌘N');
    expect(screen.getByRole('region', { name: 'In the editor' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Filter shortcuts' }), 'bold');
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Format',
    ]);
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'qqqq');
    expect(screen.getByText(/No shortcuts match/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(useUi.getState().dialog).toBeNull();
  });

  it('formats the editor hints for the platform and closes from its footer', async () => {
    const user = userEvent.setup();
    useUi.setState({ dialog: 'shortcuts', platform: 'darwin' });
    const { unmount } = render(<ShortcutsDialog />);
    const editor = screen.getByRole('region', { name: 'In the editor' });
    expect(editor).toHaveTextContent('Open the slash menu (Visual mode, empty line)');
    expect(editor).toHaveTextContent('Tab / ⇧Tab');
    expect(editor).toHaveTextContent('Enter / ⇧Enter');
    unmount();
    useUi.setState({ platform: 'win32' });
    render(<ShortcutsDialog />);
    expect(screen.getByRole('region', { name: 'In the editor' })).toHaveTextContent('Tab / Shift+Tab');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUi.getState().dialog).toBeNull();
  });
});

describe('formatHintKeys', () => {
  it('joins platform-formatted alternatives', () => {
    expect(formatHintKeys(['Enter', 'Shift+Enter'], 'darwin')).toBe('Enter / ⇧Enter');
    expect(formatHintKeys(['/'], 'linux')).toBe('/');
    expect(EDITOR_HINTS.every((hint) => hint.keys.length > 0)).toBe(true);
  });
});

describe('AboutDialog', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
  });

  it('shows fallbacks before app info is known', () => {
    render(<AboutDialog />);
    expect(screen.getByText('Version —')).toBeInTheDocument();
    expect(screen.queryByText('Electron')).not.toBeInTheDocument();
  });

  it('shows version details, links and the license note', async () => {
    const user = userEvent.setup();
    useUi.setState({ dialog: 'about', appInfo: { ...FAKE_APP_INFO, isPortable: true } });
    render(<AboutDialog />);
    expect(screen.getByText('Version 1.0.0 · Portable')).toBeInTheDocument();
    // Enter right after opening must not launch the browser.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByText('44.4.5')).toBeInTheDocument();
    expect(screen.getByText(/Non-commercial license/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Source code' }));
    await user.click(screen.getByRole('button', { name: 'Report an issue' }));
    await user.click(screen.getByRole('button', { name: 'License' }));
    expect(vi.mocked(api.app.openExternal).mock.calls.map(([url]) => url)).toEqual([
      PROJECT_LINKS.repository,
      PROJECT_LINKS.issues,
      PROJECT_LINKS.license,
    ]);
    vi.mocked(api.app.openExternal).mockRejectedValueOnce(new Error('blocked'));
    await user.click(screen.getByRole('button', { name: 'Source code' }));
    await vi.waitFor(() => expect(useUi.getState().toasts[0]?.message).toBe('Could not open the link.'));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUi.getState().dialog).toBeNull();
  });
});

describe('Toasts', () => {
  beforeEach(() => {
    resetApp();
  });

  it('renders toasts with roles and dismisses them', async () => {
    render(<Toasts />);
    act(() => {
      useUi.getState().pushToast('success', 'Saved', { durationMs: 0 });
      useUi.getState().pushToast('error', 'Failed', { detail: 'Disk full', durationMs: 0 });
      useUi.getState().pushToast('warning', 'Careful', { durationMs: 0 });
      useUi.getState().pushToast('info', 'FYI', { durationMs: 0 });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('FailedDisk full');
    expect(screen.getAllByRole('status')).toHaveLength(3);
    await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]!);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

describe('DropOverlay', () => {
  beforeEach(() => {
    resetApp();
  });

  it('is only visible while files are dragged', () => {
    render(<DropOverlay />);
    expect(screen.queryByText(/Drop Markdown files/)).not.toBeInTheDocument();
    act(() => useUi.getState().setDropActive(true));
    expect(screen.getByText('Drop Markdown files to open them')).toBeInTheDocument();
  });
});
