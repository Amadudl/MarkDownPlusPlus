import type { EditorMode, FileReadResult, LineEnding, UnsavedChoice } from '@shared/types';
import { buildStandaloneHtml } from '@renderer/export';
import { getApi } from '@renderer/platform/api';
import { stripExtension } from '@renderer/platform/paths';
import { resolveTheme } from '@renderer/themes';
import { getAdapter } from '@renderer/store/adapters';
import { isDirty, selectActiveDocument, useDocuments, type DocumentTab } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { toastError, useUi } from '@renderer/store/ui';
import welcomeMarkdown from '@renderer/content/welcome.md?raw';

/** Title of the bundled tutorial document. */
export const TUTORIAL_TITLE = 'Welcome to MarkDown++';

function getDocument(id: string): DocumentTab | undefined {
  return useDocuments.getState().documents.find((doc) => doc.id === id);
}

/** The mode new documents open in, from the settings. */
export function defaultMode(): EditorMode {
  return useSettings.getState().settings.editor.defaultMode;
}

/** Line ending for new documents; `system` means CRLF on Windows and LF elsewhere. */
export function newDocumentLineEnding(): LineEnding {
  const preference = useSettings.getState().settings.editor.newLineEnding;
  if (preference !== 'system') return preference;
  return useUi.getState().platform === 'win32' ? 'crlf' : 'lf';
}

/** Creates and activates a new untitled document. */
export function createNewDocument(): string {
  return useDocuments.getState().newDocument({ mode: defaultMode(), lineEnding: newDocumentLineEnding() });
}

/** Opens the bundled tutorial as an (unsaved, clean) document. */
export function openTutorial(): string {
  const existing = useDocuments
    .getState()
    .documents.find((doc) => doc.path === null && doc.title === TUTORIAL_TITLE);
  if (existing !== undefined) {
    useDocuments.getState().activate(existing.id);
    return existing.id;
  }
  return useDocuments.getState().newDocument({
    mode: 'wysiwyg',
    lineEnding: newDocumentLineEnding(),
    content: welcomeMarkdown,
    title: TUTORIAL_TITLE,
  });
}

/** Opens files read by the main process (dialog, drop, OS "open with"). */
export function openFiles(files: readonly FileReadResult[], mode: EditorMode = defaultMode()): void {
  for (const file of files) useDocuments.getState().openFile(file, mode);
}

/** Shows the open dialog and opens the chosen files. */
export async function openWithDialog(): Promise<void> {
  try {
    openFiles(await getApi().file.openDialog());
  } catch (error) {
    toastError('Could not open file.', error);
  }
}

/**
 * Reads a file from disk and opens it (or activates it when already open).
 * @returns true on success; failures are reported with a toast.
 */
export async function openPath(path: string, mode: EditorMode = defaultMode()): Promise<boolean> {
  const existing = useDocuments.getState().findByPath(path);
  if (existing !== undefined) {
    useDocuments.getState().activate(existing.id);
    return true;
  }
  try {
    const file = await getApi().file.read(path);
    useDocuments.getState().openFile(file, mode);
    return true;
  } catch (error) {
    toastError(`Could not open ${path}`, error);
    return false;
  }
}

/** Pulls the latest markdown out of the mounted editor into the store. */
export function flushEditor(id: string): DocumentTab | undefined {
  const adapter = getAdapter(id);
  if (adapter !== undefined) useDocuments.getState().updateContent(id, adapter.getMarkdown());
  return getDocument(id);
}

/**
 * Saves a document: to its path when it has one, otherwise through "Save As".
 * @returns true when the document was written.
 */
export async function saveDocument(id: string): Promise<boolean> {
  const doc = flushEditor(id);
  if (doc === undefined) return false;
  if (doc.path === null) return saveDocumentAs(id);
  try {
    const result = await getApi().file.save({
      path: doc.path,
      content: doc.content,
      lineEnding: doc.lineEnding,
      hasBom: doc.hasBom,
    });
    useDocuments
      .getState()
      .markSaved(id, { path: result.path, mtimeMs: result.mtimeMs, content: doc.content });
    return true;
  } catch (error) {
    toastError(`Could not save ${doc.title}`, error);
    return false;
  }
}

const MARKDOWN_NAME = /\.(?:md|markdown|mdown|mkd|txt)$/i;

/**
 * Releases the tab `duplicateId` whose file was just overwritten by a Save As of the tab
 * `savedId`. A clean tab simply closes. Unsaved edits are never dropped silently: the user
 * decides (when confirmations are on) to discard them, keep them in an untitled tab, or
 * save them to another location. Saving back to the same path is not offered because it
 * would overwrite the file that was just written.
 */
async function releaseOverwrittenTab(duplicateId: string, savedId: string): Promise<void> {
  const store = useDocuments.getState;
  const duplicate = flushEditor(duplicateId);
  if (duplicate === undefined) return;
  if (!isDirty(duplicate) || !useSettings.getState().settings.general.confirmOnClose) {
    store().close(duplicateId);
    return;
  }
  store().activate(duplicateId);
  let choice: UnsavedChoice;
  try {
    choice = await getApi().app.confirmUnsaved(duplicate.title);
  } catch (error) {
    toastError('Could not ask about unsaved changes.', error);
    choice = 'cancel';
  }
  if (choice === 'discard') {
    store().close(duplicateId);
    store().activate(savedId);
    return;
  }
  store().detach(duplicateId);
  if (choice === 'save' && (await saveDocumentAs(duplicateId))) return;
  useUi
    .getState()
    .pushToast('info', `Your unsaved edits of ${duplicate.title} were kept in a separate, untitled tab.`);
}

/**
 * Asks for a location and saves the document there.
 * @returns true when written, false when cancelled or failed.
 */
export async function saveDocumentAs(id: string): Promise<boolean> {
  const doc = flushEditor(id);
  if (doc === undefined) return false;
  const suggestedName = doc.path === null && !MARKDOWN_NAME.test(doc.title) ? `${doc.title}.md` : doc.title;
  try {
    const result = await getApi().file.saveAs({
      suggestedName,
      documentPath: doc.path,
      content: doc.content,
      lineEnding: doc.lineEnding,
      hasBom: doc.hasBom,
    });
    if (result === null) return false;
    const duplicate = useDocuments.getState().findByPath(result.path);
    useDocuments
      .getState()
      .markSaved(id, { path: result.path, mtimeMs: result.mtimeMs, content: doc.content });
    if (duplicate !== undefined && duplicate.id !== id) await releaseOverwrittenTab(duplicate.id, id);
    return true;
  } catch (error) {
    toastError(`Could not save ${doc.title}`, error);
    return false;
  }
}

/** Saves every dirty document. Untitled ones prompt for a location. */
export async function saveAllDocuments(): Promise<boolean> {
  let allSaved = true;
  for (const doc of useDocuments.getState().documents) {
    const current = flushEditor(doc.id);
    if (current !== undefined && isDirty(current)) allSaved = (await saveDocument(doc.id)) && allSaved;
  }
  return allSaved;
}

/**
 * Asks what to do with unsaved changes of a document (when it is dirty and the
 * user enabled confirmation). Resolves to true when the caller may discard the tab.
 */
export async function resolveUnsaved(id: string): Promise<boolean> {
  const doc = flushEditor(id);
  if (doc === undefined) return true;
  if (!isDirty(doc) || !useSettings.getState().settings.general.confirmOnClose) return true;
  useDocuments.getState().activate(id);
  let choice: UnsavedChoice;
  try {
    choice = await getApi().app.confirmUnsaved(doc.title);
  } catch (error) {
    toastError('Could not ask about unsaved changes.', error);
    return false;
  }
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveDocument(id);
  return true;
}

/** Closes a document after resolving unsaved changes. Resolves to true when closed. */
export async function closeDocument(id: string): Promise<boolean> {
  if (!(await resolveUnsaved(id))) return false;
  useDocuments.getState().close(id);
  return true;
}

/** Closes every document; stops at the first one the user decides to keep. */
export async function closeAllDocuments(): Promise<boolean> {
  for (const doc of [...useDocuments.getState().documents]) {
    if (!(await closeDocument(doc.id))) return false;
  }
  return true;
}

/** Exports the active document as a standalone HTML file or a PDF. */
export async function exportActiveDocument(format: 'html' | 'pdf'): Promise<void> {
  const { activeId } = useDocuments.getState();
  const doc = activeId === null ? undefined : flushEditor(activeId);
  if (doc === undefined) {
    useUi.getState().pushToast('info', 'Open a document to export it.');
    return;
  }
  const { settings } = useSettings.getState();
  const baseName = stripExtension(doc.title);
  try {
    const html = await buildStandaloneHtml({
      title: baseName,
      markdown: doc.content,
      documentPath: doc.path,
      theme: resolveTheme(settings, useUi.getState().prefersDark),
      loadRemoteImages: settings.rendering.loadRemoteImages,
    });
    const api = getApi().file;
    const target =
      format === 'html'
        ? await api.exportHtml({ suggestedName: `${baseName}.html`, documentPath: doc.path, html })
        : await api.exportPdf({ suggestedName: `${baseName}.pdf`, documentPath: doc.path, html });
    if (target === null) return;
    useUi.getState().pushToast('success', `Exported to ${target}`);
  } catch (error) {
    toastError(`Could not export ${format.toUpperCase()}.`, error);
  }
}

/** Reveals the active document in the OS file manager. */
export async function revealActiveDocument(): Promise<void> {
  const path = selectActiveDocument(useDocuments.getState())?.path ?? null;
  if (path === null) {
    useUi.getState().pushToast('info', 'Save the document first to reveal it in its folder.');
    return;
  }
  try {
    await getApi().file.revealInFolder(path);
  } catch (error) {
    toastError('Could not reveal the file.', error);
  }
}

/** Reloads a document from disk, discarding the in-memory version. */
export async function reloadDocument(id: string): Promise<boolean> {
  const doc = getDocument(id);
  const path = doc?.path ?? null;
  if (doc === undefined || path === null) return false;
  try {
    const file = await getApi().file.read(path);
    useDocuments.getState().reloadFromDisk(id, file);
    return true;
  } catch (error) {
    toastError(`Could not reload ${doc.title}`, error);
    return false;
  }
}

/** Toggles the line ending of a document between LF and CRLF (marks it dirty). */
export function toggleLineEnding(id: string): void {
  const doc = getDocument(id);
  if (doc === undefined) return;
  useDocuments.getState().setLineEnding(id, doc.lineEnding === 'lf' ? 'crlf' : 'lf');
}
