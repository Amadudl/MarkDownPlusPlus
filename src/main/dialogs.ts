import { basename, extname, join } from 'node:path';
import { app, dialog, type BrowserWindow, type FileFilter } from 'electron';
import type { UnsavedChoice } from '../shared/types';
import { MARKDOWN_EXTENSIONS } from './services/fileService';

const MARKDOWN_FILTER: FileFilter = {
  name: 'Markdown',
  extensions: MARKDOWN_EXTENSIONS.filter((ext) => ext !== '.txt').map((ext) => ext.slice(1)),
};
const TEXT_FILTER: FileFilter = { name: 'Text', extensions: ['txt'] };
const ALL_FILES_FILTER: FileFilter = { name: 'All Files', extensions: ['*'] };

/** Export target formats offered by {@link showExportDialog}. */
export type ExportFormat = 'html' | 'pdf';

const EXPORT_FILTERS: Record<ExportFormat, FileFilter> = {
  html: { name: 'HTML Document', extensions: ['html', 'htm'] },
  pdf: { name: 'PDF Document', extensions: ['pdf'] },
};

/**
 * Turns an untrusted suggested file name into a safe base name: removes path
 * separators, reserved and control characters and guarantees `extension`
 * unless the name already ends with one of `accepted`.
 */
export function sanitizeFileName(
  name: string,
  extension: string,
  accepted: readonly string[] = [extension],
): string {
  const cleaned = basename(name.replace(/\\/g, '/'))
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 200);
  const base = cleaned === '' ? 'Untitled' : cleaned;
  return accepted.includes(extname(base).toLowerCase()) ? base : `${base}${extension}`;
}

/** The folder a save dialog starts in: `directory` when given, else the user's Documents folder. */
function startDirectory(directory: string | null): string {
  return directory ?? app.getPath('documents');
}

/** Shows the multi-select "Open" dialog; returns the chosen absolute paths. */
export async function showOpenMarkdownDialog(parent: BrowserWindow | null): Promise<string[]> {
  const options: Electron.OpenDialogOptions = {
    title: 'Open Markdown Files',
    properties: ['openFile', 'multiSelections'],
    filters: [MARKDOWN_FILTER, TEXT_FILTER, ALL_FILES_FILTER],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/**
 * Shows the "Save As" dialog for a markdown document, starting in `directory`
 * (the document's folder) or Documents; returns the chosen path or `null`.
 */
export async function showSaveMarkdownDialog(
  parent: BrowserWindow | null,
  suggestedName: string,
  directory: string | null = null,
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: 'Save Markdown File',
    defaultPath: join(startDirectory(directory), sanitizeFileName(suggestedName, '.md', MARKDOWN_EXTENSIONS)),
    filters: [MARKDOWN_FILTER, TEXT_FILTER, ALL_FILES_FILTER],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  };
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
  return result.canceled || result.filePath === '' ? null : result.filePath;
}

/**
 * Shows the save dialog of an export, starting in `directory` (the document's
 * folder) or Documents; returns the chosen path or `null`.
 */
export async function showExportDialog(
  parent: BrowserWindow | null,
  suggestedName: string,
  format: ExportFormat,
  directory: string | null = null,
): Promise<string | null> {
  const filter = EXPORT_FILTERS[format];
  const stem = suggestedName.replace(/\.(md|markdown|mdown|mkdn?|mdwn|mdx|txt)$/i, '');
  const accepted = filter.extensions.map((ext) => `.${ext}`);
  const options: Electron.SaveDialogOptions = {
    title: format === 'html' ? 'Export as HTML' : 'Export as PDF',
    defaultPath: join(startDirectory(directory), sanitizeFileName(stem, `.${format}`, accepted)),
    filters: [filter],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  };
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
  return result.canceled || result.filePath === '' ? null : result.filePath;
}

async function messageBox(
  parent: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<number> {
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return result.response;
}

/** Asks whether unsaved changes of `documentTitle` should be saved before closing. */
export async function confirmUnsaved(
  parent: BrowserWindow | null,
  documentTitle: string,
): Promise<UnsavedChoice> {
  const response = await messageBox(parent, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: `Do you want to save the changes you made to "${documentTitle}"?`,
    detail: "Your changes will be lost if you don't save them.",
  });
  const choices: readonly UnsavedChoice[] = ['save', 'discard', 'cancel'];
  return choices[response] ?? 'cancel';
}

/** Asks whether a document changed on disk should be reloaded; true means reload. */
export async function confirmReload(parent: BrowserWindow | null, documentTitle: string): Promise<boolean> {
  const response = await messageBox(parent, {
    type: 'question',
    buttons: ['Reload', 'Keep My Version'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: `"${documentTitle}" was changed by another program.`,
    detail: 'Do you want to reload it from disk? Unsaved changes in the editor will be lost.',
  });
  return response === 0;
}
