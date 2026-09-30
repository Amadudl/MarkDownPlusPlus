import { describe, expect, it } from 'vitest';
import { CommandId, isCommandId } from './commands';
import { formatAccelerator, MAC_SHORTCUT_OVERRIDES, SHORTCUTS, shortcutFor, shortcutsFor } from './shortcuts';

describe('SHORTCUTS', () => {
  it('only binds known commands', () => {
    for (const id of Object.keys(SHORTCUTS)) expect(isCommandId(id)).toBe(true);
  });

  it('never binds the same accelerator twice', () => {
    const accelerators = Object.values(SHORTCUTS);
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  it('binds the mode switch and the essentials', () => {
    expect(SHORTCUTS[CommandId.ViewToggleMode]).toBe('CmdOrCtrl+E');
    expect(SHORTCUTS[CommandId.FileSave]).toBe('CmdOrCtrl+S');
    expect(SHORTCUTS[CommandId.ViewCommandPalette]).toBe('CmdOrCtrl+Shift+P');
  });
});

describe('shortcutsFor / shortcutFor', () => {
  it('uses the base table on Windows and Linux', () => {
    expect(shortcutsFor('win32')).toBe(SHORTCUTS);
    expect(shortcutsFor('linux')).toBe(SHORTCUTS);
    expect(shortcutFor(CommandId.EditReplace, 'win32')).toBe('CmdOrCtrl+H');
  });

  it('moves Find and Replace off Cmd+H (Hide) on macOS', () => {
    expect(shortcutFor(CommandId.EditReplace, 'darwin')).toBe('Cmd+Alt+F');
    expect(formatAccelerator(shortcutFor(CommandId.EditReplace, 'darwin') ?? '', 'darwin')).toBe('⌘⌥F');
    expect(Object.values(shortcutsFor('darwin'))).not.toContain('CmdOrCtrl+H');
  });

  it('leaves Cmd+` (cycle through windows) to macOS', () => {
    expect(shortcutFor(CommandId.FormatInlineCode, 'darwin')).toBe('Ctrl+`');
    expect(formatAccelerator(shortcutFor(CommandId.FormatInlineCode, 'darwin') ?? '', 'darwin')).toBe('⌃`');
    expect(shortcutFor(CommandId.FormatInlineCode, 'linux')).toBe('CmdOrCtrl+`');
    for (const accelerator of Object.values(shortcutsFor('darwin'))) {
      expect(accelerator).not.toMatch(/^(?:CmdOrCtrl|Cmd)\+`$/);
    }
  });

  it('keeps every other macOS shortcut from the base table', () => {
    const mac = shortcutsFor('darwin');
    expect(Object.keys(mac).sort()).toEqual(Object.keys(SHORTCUTS).sort());
    for (const [id, accelerator] of Object.entries(SHORTCUTS)) {
      const override = (MAC_SHORTCUT_OVERRIDES as Record<string, string | undefined>)[id];
      expect(mac[id as keyof typeof mac]).toBe(override ?? accelerator);
    }
  });

  it('never binds the same key twice on macOS', () => {
    const accelerators = Object.values(shortcutsFor('darwin')).map((accelerator) =>
      accelerator.replace(/^CmdOrCtrl\+/, 'Cmd+'),
    );
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  it('returns undefined for commands without a shortcut', () => {
    expect(shortcutFor(CommandId.FileCloseAll, 'darwin')).toBeUndefined();
  });
});

describe('formatAccelerator', () => {
  it('uses symbols without separators on macOS', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+P', 'darwin')).toBe('⌘⇧P');
    expect(formatAccelerator('CommandOrControl+Alt+s', 'darwin')).toBe('⌘⌥S');
    expect(formatAccelerator('Cmd+Option+Control+x', 'darwin')).toBe('⌘⌥⌃X');
    expect(formatAccelerator('Command+Ctrl+Tab', 'darwin')).toBe('⌘⌃Tab');
  });

  it('uses words joined by plus elsewhere', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+P', 'win32')).toBe('Ctrl+Shift+P');
    expect(formatAccelerator('CommandOrControl+Alt+s', 'linux')).toBe('Ctrl+Alt+S');
    expect(formatAccelerator('Control+Option+F5', 'linux')).toBe('Ctrl+Alt+F5');
    expect(formatAccelerator('Cmd+Command+`', 'win32')).toBe('⌘+⌘+`');
  });

  it('formats every configured shortcut on both platform families', () => {
    for (const accelerator of Object.values(SHORTCUTS)) {
      expect(formatAccelerator(accelerator, 'darwin')).not.toContain('CmdOrCtrl');
      expect(formatAccelerator(accelerator, 'win32')).not.toContain('CmdOrCtrl');
    }
  });
});
