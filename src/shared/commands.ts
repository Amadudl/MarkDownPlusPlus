/**
 * Stable identifiers for every user-facing command. The application menu (main
 * process), the command palette, the toolbar and keyboard shortcuts all refer to
 * commands by these ids, so behaviour is defined exactly once in the renderer.
 */
export const CommandId = {
  FileNew: 'file.new',
  FileOpen: 'file.open',
  FileSave: 'file.save',
  FileSaveAs: 'file.saveAs',
  FileSaveAll: 'file.saveAll',
  FileClose: 'file.close',
  FileCloseAll: 'file.closeAll',
  FileExportHtml: 'file.exportHtml',
  FileExportPdf: 'file.exportPdf',
  FileExportImage: 'file.exportImage',
  FileRevealInFolder: 'file.reveal',
  FileOpenRecent: 'file.openRecent',
  FileClearRecent: 'file.clearRecent',
  EditUndo: 'edit.undo',
  EditRedo: 'edit.redo',
  EditFind: 'edit.find',
  EditReplace: 'edit.replace',
  ViewToggleMode: 'view.toggleMode',
  ViewWysiwyg: 'view.wysiwyg',
  ViewSource: 'view.source',
  ViewCommandPalette: 'view.commandPalette',
  ViewZoomIn: 'view.zoomIn',
  ViewZoomOut: 'view.zoomOut',
  ViewZoomReset: 'view.zoomReset',
  ViewToggleFocusMode: 'view.toggleFocusMode',
  ViewToggleOutline: 'view.toggleOutline',
  ViewNextTab: 'view.nextTab',
  ViewPreviousTab: 'view.previousTab',
  FormatBold: 'format.bold',
  FormatItalic: 'format.italic',
  FormatStrikethrough: 'format.strikethrough',
  FormatInlineCode: 'format.inlineCode',
  FormatLink: 'format.link',
  FormatHeading1: 'format.heading1',
  FormatHeading2: 'format.heading2',
  FormatHeading3: 'format.heading3',
  FormatParagraph: 'format.paragraph',
  FormatBulletList: 'format.bulletList',
  FormatOrderedList: 'format.orderedList',
  FormatTaskList: 'format.taskList',
  FormatBlockquote: 'format.blockquote',
  FormatCodeBlock: 'format.codeBlock',
  FormatTable: 'format.table',
  FormatHorizontalRule: 'format.horizontalRule',
  SettingsOpen: 'settings.open',
  HelpShortcuts: 'help.shortcuts',
  HelpAbout: 'help.about',
  HelpDocumentation: 'help.documentation',
} as const;

export type CommandIdValue = (typeof CommandId)[keyof typeof CommandId];

const ALL_COMMAND_IDS: ReadonlySet<string> = new Set(Object.values(CommandId));

/** Runtime guard used on every IPC boundary that carries a command id. */
export function isCommandId(value: unknown): value is CommandIdValue {
  return typeof value === 'string' && ALL_COMMAND_IDS.has(value);
}
