import { CommandId, type CommandIdValue } from './commands';

/**
 * Keyboard shortcuts in Electron accelerator syntax. The main process is the
 * single place that handles the key press: `src/main/keyboard.ts` matches every
 * key press in `before-input-event`, swallows it (page and menu accelerator) and
 * sends the command to the renderer. The native menu shows them as accelerators
 * and the renderer only *displays* them (command palette, tooltips, shortcut sheet).
 *
 * This is the cross-platform base table. Always resolve a platform's effective
 * shortcuts with {@link shortcutsFor} / {@link shortcutFor}, which apply
 * {@link MAC_SHORTCUT_OVERRIDES} on macOS.
 */
export const SHORTCUTS: Readonly<Partial<Record<CommandIdValue, string>>> = {
  [CommandId.FileNew]: 'CmdOrCtrl+N',
  [CommandId.FileOpen]: 'CmdOrCtrl+O',
  [CommandId.FileSave]: 'CmdOrCtrl+S',
  [CommandId.FileSaveAs]: 'CmdOrCtrl+Shift+S',
  [CommandId.FileSaveAll]: 'CmdOrCtrl+Alt+S',
  [CommandId.FileClose]: 'CmdOrCtrl+W',
  [CommandId.FileExportPdf]: 'CmdOrCtrl+Shift+E',
  [CommandId.EditUndo]: 'CmdOrCtrl+Z',
  [CommandId.EditRedo]: 'CmdOrCtrl+Shift+Z',
  [CommandId.EditFind]: 'CmdOrCtrl+F',
  [CommandId.EditReplace]: 'CmdOrCtrl+H',
  [CommandId.ViewToggleMode]: 'CmdOrCtrl+E',
  [CommandId.ViewCommandPalette]: 'CmdOrCtrl+Shift+P',
  [CommandId.ViewZoomIn]: 'CmdOrCtrl+=',
  [CommandId.ViewZoomOut]: 'CmdOrCtrl+-',
  [CommandId.ViewZoomReset]: 'CmdOrCtrl+0',
  [CommandId.ViewToggleFocusMode]: 'CmdOrCtrl+Shift+F',
  [CommandId.ViewToggleOutline]: 'CmdOrCtrl+Shift+O',
  [CommandId.ViewNextTab]: 'Ctrl+Tab',
  [CommandId.ViewPreviousTab]: 'Ctrl+Shift+Tab',
  [CommandId.FormatBold]: 'CmdOrCtrl+B',
  [CommandId.FormatItalic]: 'CmdOrCtrl+I',
  [CommandId.FormatStrikethrough]: 'CmdOrCtrl+Shift+X',
  [CommandId.FormatInlineCode]: 'CmdOrCtrl+`',
  [CommandId.FormatLink]: 'CmdOrCtrl+K',
  [CommandId.FormatHeading1]: 'CmdOrCtrl+1',
  [CommandId.FormatHeading2]: 'CmdOrCtrl+2',
  [CommandId.FormatHeading3]: 'CmdOrCtrl+3',
  [CommandId.FormatParagraph]: 'CmdOrCtrl+Alt+0',
  [CommandId.FormatBulletList]: 'CmdOrCtrl+Shift+8',
  [CommandId.FormatOrderedList]: 'CmdOrCtrl+Shift+7',
  [CommandId.FormatTaskList]: 'CmdOrCtrl+Shift+9',
  [CommandId.FormatBlockquote]: 'CmdOrCtrl+Shift+B',
  [CommandId.FormatCodeBlock]: 'CmdOrCtrl+Alt+C',
  [CommandId.FormatTable]: 'CmdOrCtrl+Alt+T',
  [CommandId.SettingsOpen]: 'CmdOrCtrl+,',
  [CommandId.HelpShortcuts]: 'CmdOrCtrl+/',
};

/**
 * macOS replacements for base shortcuts that collide with a standard macOS menu
 * role or system shortcut. `Cmd+H` is *Hide MarkDown++* on macOS, so Find and
 * Replace uses the native macOS convention `Cmd+Option+F` there; `Cmd+`` cycles
 * through the app's windows, so Inline Code uses `Ctrl+`` (as in Typora).
 */
export const MAC_SHORTCUT_OVERRIDES: Readonly<Partial<Record<CommandIdValue, string>>> = {
  [CommandId.EditReplace]: 'Cmd+Alt+F',
  [CommandId.FormatInlineCode]: 'Ctrl+`',
};

const MAC_SHORTCUTS: Readonly<Partial<Record<CommandIdValue, string>>> = {
  ...SHORTCUTS,
  ...MAC_SHORTCUT_OVERRIDES,
};

/**
 * The effective shortcut table of `platform` (a `process.platform` value):
 * {@link SHORTCUTS} with {@link MAC_SHORTCUT_OVERRIDES} applied on `darwin`.
 */
export function shortcutsFor(platform: string): Readonly<Partial<Record<CommandIdValue, string>>> {
  return platform === 'darwin' ? MAC_SHORTCUTS : SHORTCUTS;
}

/** The effective accelerator of `command` on `platform`, or `undefined` if it has none. */
export function shortcutFor(command: CommandIdValue, platform: string): string | undefined {
  return shortcutsFor(platform)[command];
}

/**
 * Renders an accelerator for display, e.g. `CmdOrCtrl+Shift+P` → `⌘⇧P` on macOS
 * and `Ctrl+Shift+P` elsewhere.
 */
export function formatAccelerator(accelerator: string, platform: string): string {
  const mac = platform === 'darwin';
  const parts = accelerator.split('+').map((part) => {
    switch (part) {
      case 'CmdOrCtrl':
      case 'CommandOrControl':
        return mac ? '⌘' : 'Ctrl';
      case 'Cmd':
      case 'Command':
        return '⌘';
      case 'Ctrl':
      case 'Control':
        return mac ? '⌃' : 'Ctrl';
      case 'Shift':
        return mac ? '⇧' : 'Shift';
      case 'Alt':
      case 'Option':
        return mac ? '⌥' : 'Alt';
      default:
        return part.length === 1 ? part.toUpperCase() : part;
    }
  });
  return mac ? parts.join('') : parts.join('+');
}
