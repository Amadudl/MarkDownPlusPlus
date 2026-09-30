import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAdapter } from '@renderer/test/fakeEditor';
import { resetApp } from '@renderer/test/utils';
import { registerDefaultCommands } from '@renderer/commands';
import { setAdapter } from '@renderer/store/adapters';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { TOOLBAR_GROUPS, Toolbar } from './Toolbar';

describe('Toolbar', () => {
  beforeEach(() => {
    resetApp();
    registerDefaultCommands();
  });

  it('renders every group with tooltips and shortcuts', () => {
    render(<Toolbar />);
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(TOOLBAR_GROUPS.flat().length);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('data-shortcut', 'Ctrl+B');
    expect(screen.getByRole('button', { name: 'Horizontal rule' })).not.toHaveAttribute('data-shortcut');
  });

  it('opens the tooltips of the first group towards the window content', () => {
    render(<Toolbar />);
    for (const item of TOOLBAR_GROUPS[0]!) {
      expect(screen.getByRole('button', { name: item.label })).toHaveAttribute(
        'data-tooltip-placement',
        'start',
      );
    }
    expect(screen.getByRole('button', { name: 'Heading 1' })).toHaveAttribute(
      'data-tooltip-placement',
      'bottom',
    );
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('data-shortcut', 'Ctrl+F');
  });

  it('runs commands on the active editor without stealing focus', async () => {
    const id = useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const adapter = createFakeAdapter('wysiwyg', '');
    setAdapter(id, adapter);
    render(<Toolbar />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(fireEvent.mouseDown(bold)).toBe(false);
    await userEvent.click(bold);
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await vi.waitFor(() => expect(adapter.commands).toEqual(['bold', 'table']));
    expect(useUi.getState().findBar).toMatchObject({ open: true, replace: false });
  });

  it('moves focus with arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('tabindex', '0');
    expect(buttons[1]).toHaveAttribute('tabindex', '-1');
    buttons[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(buttons.at(-1)).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('toolbar'), { key: 'ArrowRight' });
    expect(buttons[0]).toHaveFocus();
    // Without a focused button, arrows start from the ends.
    buttons[0]!.blur();
    fireEvent.keyDown(screen.getByRole('toolbar'), { key: 'ArrowLeft' });
    expect(buttons.at(-1)).toHaveFocus();
  });
});
