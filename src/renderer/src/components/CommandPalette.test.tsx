import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp } from '@renderer/test/utils';
import { registerDefaultCommands } from '@renderer/commands';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { CommandPalette, highlight } from './CommandPalette';

const open = (): void => act(() => useUi.getState().setPaletteOpen(true));

describe('highlight', () => {
  it('splits text into marked runs', () => {
    render(<p data-testid="h">{highlight('Save As', [0, 1, 5])}</p>);
    const marks = screen.getByTestId('h').querySelectorAll('mark');
    expect([...marks].map((mark) => mark.textContent)).toEqual(['Sa', 'A']);
    expect(highlight('plain', [])).toBe('plain');
  });
});

describe('CommandPalette', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/docs/recent.md', 'R')]);
    api.state.recent = Array.from({ length: 7 }, (_, index) => ({
      path: `/docs/file${index}.md`,
      openedAt: index,
    }));
    api.state.recent[0] = { path: '/docs/recent.md', openedAt: 99 };
    registerDefaultCommands();
  });

  it('renders nothing while closed', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('lists up to five recent files first, then commands', async () => {
    open();
    render(<CommandPalette />);
    const input = screen.getByRole('combobox', { name: 'Search commands and recent files' });
    expect(input).toHaveFocus();
    await vi.waitFor(() => expect(screen.getByText('recent.md')).toBeInTheDocument());
    const options = screen.getAllByRole('option');
    expect(options.filter((option) => option.textContent.includes('/docs'))).toHaveLength(5);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(screen.getByRole('option', { name: /Toggle Visual \/ Markdown Mode/ })).toHaveTextContent(
      'Ctrl+E',
    );
    expect(screen.queryByRole('option', { name: /Open Recent File/ })).not.toBeInTheDocument();
  });

  it('filters fuzzily and runs the selected command with Enter', async () => {
    const user = userEvent.setup();
    open();
    render(<CommandPalette />);
    await user.type(screen.getByRole('combobox'), 'tgl focus');
    const [first] = screen.getAllByRole('option');
    expect(first).toHaveTextContent('Toggle Focus Mode');
    expect(first!.querySelectorAll('mark').length).toBeGreaterThan(0);
    await user.keyboard('{Enter}');
    expect(useUi.getState().paletteOpen).toBe(false);
    await vi.waitFor(() => expect(useUi.getState().focusMode).toBe(true));
  });

  it('navigates with arrows, Home and End and wraps around', async () => {
    const user = userEvent.setup();
    open();
    render(<CommandPalette />);
    await vi.waitFor(() => expect(screen.getByText('recent.md')).toBeInTheDocument());
    const count = screen.getAllByRole('option').length;
    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[count - 1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(screen.getAllByRole('option')[count - 1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('x');
    expect(screen.getByRole('combobox')).toHaveValue('x');
  });

  it('opens recent files with the mouse and follows hover', async () => {
    const user = userEvent.setup();
    open();
    render(<CommandPalette />);
    const recent = await screen.findByText('recent.md');
    const option = recent.closest('[role="option"]')!;
    await user.hover(screen.getAllByRole('option')[2]!);
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.mouseMove(screen.getAllByRole('option')[2]!);
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    await user.click(option);
    await vi.waitFor(() =>
      expect(selectActiveDocument(useDocuments.getState())?.path).toBe('/docs/recent.md'),
    );
  });

  it('shows an empty state and ignores Enter/arrows without results', async () => {
    const user = userEvent.setup();
    open();
    render(<CommandPalette />);
    await user.type(screen.getByRole('combobox'), 'zzzzqqq');
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(useUi.getState().paletteOpen).toBe(true);
    await user.keyboard('{Escape}');
    expect(useUi.getState().paletteOpen).toBe(false);
  });

  it('reports recent-file errors and ignores late results after closing', async () => {
    vi.mocked(api.recent.get).mockRejectedValueOnce(new Error('broken store'));
    open();
    const { unmount } = render(<CommandPalette />);
    await vi.waitFor(() => expect(useUi.getState().toasts[0]?.message).toBe('Could not load recent files.'));
    unmount();
    let resolve: (value: []) => void = () => undefined;
    vi.mocked(api.recent.get).mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const second = render(<CommandPalette />);
    second.unmount();
    resolve([]);
    expect(within(document.body).queryByRole('option')).not.toBeInTheDocument();
  });
});
