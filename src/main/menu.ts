import { Menu, type MenuItemConstructorOptions } from 'electron';
import { CommandId, type CommandIdValue } from '../shared/commands';
import { shortcutFor } from '../shared/shortcuts';
import type { RecentFile } from '../shared/types';

/** Issue tracker opened by Help → Report an Issue. */
export const ISSUES_URL = 'https://github.com/Amadudl/MarkDownPlusPlus/issues';

/** Inputs of {@link buildMenuTemplate}. */
export interface MenuContext {
  readonly appName: string;
  readonly platform: NodeJS.Platform;
  /** DevTools are only offered in unpackaged (development) builds. */
  readonly isPackaged: boolean;
  readonly recentFiles: readonly RecentFile[];
  /** Delivers a command (with optional argument) to the focused window. */
  readonly sendCommand: (command: CommandIdValue, arg?: string) => void;
  /** Opens an allowlisted URL in the OS browser. */
  readonly openExternal: (url: string) => void;
}

type Item = MenuItemConstructorOptions;
const separator: Item = { type: 'separator' };

/**
 * Builds the complete native menu template. Pure (no Electron calls), so the
 * structure is unit-tested; every command item sends a {@link CommandId}.
 */
export function buildMenuTemplate(context: MenuContext): Item[] {
  const mac = context.platform === 'darwin';
  const label = (text: string): string => (mac ? text.replace(/&/g, '') : text);
  const command = (text: string, id: CommandIdValue): Item => {
    const accelerator = shortcutFor(id, context.platform);
    return {
      label: text,
      ...(accelerator === undefined ? {} : { accelerator }),
      click: () => context.sendCommand(id),
    };
  };

  const recentItems: Item[] =
    context.recentFiles.length === 0
      ? [{ label: 'No Recent Files', enabled: false }]
      : context.recentFiles.map((file) => ({
          // `&` introduces a mnemonic on Windows/Linux; escape it in file names.
          label: mac ? file.path : file.path.replace(/&/g, '&&'),
          click: () => context.sendCommand(CommandId.FileOpenRecent, file.path),
        }));

  const appMenu: Item = {
    label: context.appName,
    submenu: [
      command(`About ${context.appName}`, CommandId.HelpAbout),
      separator,
      command('Settings…', CommandId.SettingsOpen),
      separator,
      { role: 'services' },
      separator,
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      separator,
      { role: 'quit' },
    ],
  };

  const fileMenu: Item = {
    label: label('&File'),
    submenu: [
      command('New', CommandId.FileNew),
      command('Open…', CommandId.FileOpen),
      {
        label: 'Open Recent',
        submenu: [
          ...recentItems,
          separator,
          {
            label: 'Clear Recent',
            enabled: context.recentFiles.length > 0,
            click: () => context.sendCommand(CommandId.FileClearRecent),
          },
        ],
      },
      separator,
      command('Save', CommandId.FileSave),
      command('Save As…', CommandId.FileSaveAs),
      command('Save All', CommandId.FileSaveAll),
      separator,
      command('Export as HTML…', CommandId.FileExportHtml),
      command('Export as PDF…', CommandId.FileExportPdf),
      command('Export as Image (PNG)…', CommandId.FileExportImage),
      separator,
      command(mac ? 'Reveal in Finder' : 'Reveal in Folder', CommandId.FileRevealInFolder),
      separator,
      command('Close Tab', CommandId.FileClose),
      command('Close All Tabs', CommandId.FileCloseAll),
      ...(mac
        ? []
        : [
            separator,
            command('Settings…', CommandId.SettingsOpen),
            separator,
            { role: 'quit', label: 'Exit' } as Item,
          ]),
    ],
  };

  const editMenu: Item = {
    label: label('&Edit'),
    submenu: [
      command('Undo', CommandId.EditUndo),
      command('Redo', CommandId.EditRedo),
      separator,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(mac ? [{ role: 'pasteAndMatchStyle' } as Item] : []),
      { role: 'selectAll' },
      separator,
      command('Find…', CommandId.EditFind),
      command('Replace…', CommandId.EditReplace),
    ],
  };

  const formatMenu: Item = {
    label: label('F&ormat'),
    submenu: [
      command('Bold', CommandId.FormatBold),
      command('Italic', CommandId.FormatItalic),
      command('Strikethrough', CommandId.FormatStrikethrough),
      command('Inline Code', CommandId.FormatInlineCode),
      command('Link…', CommandId.FormatLink),
      separator,
      command('Heading 1', CommandId.FormatHeading1),
      command('Heading 2', CommandId.FormatHeading2),
      command('Heading 3', CommandId.FormatHeading3),
      command('Paragraph', CommandId.FormatParagraph),
      separator,
      command('Bulleted List', CommandId.FormatBulletList),
      command('Numbered List', CommandId.FormatOrderedList),
      command('Task List', CommandId.FormatTaskList),
      separator,
      command('Quote', CommandId.FormatBlockquote),
      command('Code Block', CommandId.FormatCodeBlock),
      command('Table', CommandId.FormatTable),
      command('Horizontal Rule', CommandId.FormatHorizontalRule),
    ],
  };

  const viewMenu: Item = {
    label: label('&View'),
    submenu: [
      command('Toggle Visual / Markdown Mode', CommandId.ViewToggleMode),
      command('Visual Mode (WYSIWYG)', CommandId.ViewWysiwyg),
      command('Markdown Mode (source)', CommandId.ViewSource),
      separator,
      command('Command Palette…', CommandId.ViewCommandPalette),
      command('Outline', CommandId.ViewToggleOutline),
      command('Focus Mode', CommandId.ViewToggleFocusMode),
      separator,
      command('Next Tab', CommandId.ViewNextTab),
      command('Previous Tab', CommandId.ViewPreviousTab),
      separator,
      command('Zoom In', CommandId.ViewZoomIn),
      command('Zoom Out', CommandId.ViewZoomOut),
      command('Reset Zoom', CommandId.ViewZoomReset),
      separator,
      { role: 'togglefullscreen' },
      ...(context.isPackaged ? [] : [separator, { role: 'toggleDevTools' } as Item]),
    ],
  };

  const windowMenu: Item = {
    role: 'windowMenu',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, separator, { role: 'front' }],
  };

  const helpMenu: Item = {
    role: 'help',
    label: label('&Help'),
    submenu: [
      command('Documentation', CommandId.HelpDocumentation),
      command('Keyboard Shortcuts', CommandId.HelpShortcuts),
      separator,
      { label: 'Report an Issue…', click: () => context.openExternal(ISSUES_URL) },
      ...(mac ? [] : [separator, command(`About ${context.appName}`, CommandId.HelpAbout)]),
    ],
  };

  return [
    ...(mac ? [appMenu] : []),
    fileMenu,
    editMenu,
    formatMenu,
    viewMenu,
    ...(mac ? [windowMenu] : []),
    helpMenu,
  ];
}

/** Builds the template and installs it as the application menu. */
export function installApplicationMenu(context: MenuContext): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(context)));
}
