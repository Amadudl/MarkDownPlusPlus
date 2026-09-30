import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetApp } from '@renderer/test/utils';
import { registerDefaultCommands } from '@renderer/commands';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  beforeEach(() => {
    resetApp();
    registerDefaultCommands();
  });

  it('opens the palette and settings', async () => {
    render(<TopBar />);
    expect(screen.queryByRole('button', { name: /formatting toolbar/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Command palette' }));
    expect(useUi.getState().paletteOpen).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(useUi.getState().dialog).toBe('settings');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-shortcut', 'Ctrl+,');
  });

  it('toggles the formatting toolbar when a document is open', async () => {
    useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide formatting toolbar' }));
    expect(useUi.getState().toolbarCollapsed).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Show formatting toolbar' }));
    expect(useUi.getState().toolbarCollapsed).toBe(false);
  });
});
