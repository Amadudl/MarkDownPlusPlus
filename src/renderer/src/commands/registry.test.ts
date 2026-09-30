import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandId } from '@shared/commands';
import { useUi, initialUiState } from '@renderer/store/ui';
import {
  executeCommand,
  getCommand,
  listCommands,
  registerCommands,
  shortcutLabel,
  shortcutText,
} from './registry';

describe('command registry', () => {
  beforeEach(() => useUi.setState(initialUiState()));

  it('registers, lists and replaces commands', async () => {
    const run = vi.fn();
    registerCommands([{ id: CommandId.HelpAbout, label: 'About', category: 'Help', inPalette: true, run }]);
    expect(getCommand(CommandId.HelpAbout)?.label).toBe('About');
    expect(listCommands().some((command) => command.id === CommandId.HelpAbout)).toBe(true);
    await expect(executeCommand(CommandId.HelpAbout, 'arg')).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith('arg');
  });

  it('reports unknown commands and surfaces failures as toasts', async () => {
    await expect(executeCommand(CommandId.HelpDocumentation)).resolves.toBe(false);
    registerCommands([
      {
        id: CommandId.HelpShortcuts,
        label: 'Shortcuts',
        category: 'Help',
        inPalette: true,
        run: () => Promise.reject(new Error('broken')),
      },
    ]);
    await expect(executeCommand(CommandId.HelpShortcuts)).resolves.toBe(false);
    expect(useUi.getState().toasts[0]).toMatchObject({
      message: 'Command failed: Shortcuts',
      detail: 'broken',
    });
  });

  it('formats shortcuts per platform', () => {
    expect(shortcutLabel(CommandId.ViewCommandPalette, 'darwin')).toBe('⌘⇧P');
    expect(shortcutLabel(CommandId.ViewCommandPalette, 'win32')).toBe('Ctrl+Shift+P');
    expect(shortcutLabel(CommandId.FileCloseAll, 'linux')).toBeNull();
    expect(shortcutText(CommandId.FileCloseAll, 'linux')).toBeUndefined();
    expect(shortcutText(CommandId.FileSave, 'linux')).toBe('Ctrl+S');
    expect(shortcutLabel(CommandId.EditReplace, 'darwin')).toBe('⌘⌥F');
    expect(shortcutLabel(CommandId.EditReplace, 'win32')).toBe('Ctrl+H');
  });
});
