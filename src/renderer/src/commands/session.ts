import type { SessionState } from '@shared/types';
import { getApi } from '@renderer/platform/api';
import { toDesktopPlatform } from '@renderer/platform/platform';
import { useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { toastError, useUi } from '@renderer/store/ui';
import { basename } from '@renderer/platform/paths';
import { createNewDocument, openFiles, resolveUnsaved } from './documentActions';

/** Snapshot of the open files (untitled documents are not part of a session). */
export function currentSession(): SessionState {
  const { documents, activeId } = useDocuments.getState();
  const active = documents.find((doc) => doc.id === activeId);
  return {
    documents: documents.flatMap((doc) => (doc.path === null ? [] : [{ path: doc.path, mode: doc.mode }])),
    activePath: active?.path ?? null,
  };
}

/** The session to persist: the open files, or an empty one when session restore is disabled. */
function sessionToPersist(): SessionState {
  const restore = useSettings.getState().settings.editor.restoreSession;
  return restore ? currentSession() : { documents: [], activePath: null };
}

/** Persists the session (or an empty one when session restore is disabled). */
export async function saveSession(): Promise<void> {
  await getApi().session.save(sessionToPersist());
}

/** Delay that coalesces bursts of changes (e.g. opening several files) into one write. */
export const SESSION_SAVE_DELAY_MS = 300;

/**
 * Keeps the persisted session in sync with the open tabs while the app runs, so that
 * a crash, a force-quit or an OS restart that never runs the close handshake still
 * restores every file that was open. Writes are debounced and skipped when nothing
 * relevant changed (typing in a document does not touch the session).
 *
 * Nothing is written before `ready` settles: until the startup sequence has restored
 * the previous session, the (still empty) tab list must not overwrite it.
 * @returns a function that stops the synchronisation.
 */
export function startSessionPersistence(
  ready: Promise<unknown>,
  delayMs: number = SESSION_SAVE_DELAY_MS,
): () => void {
  let active = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved: string | null = null;

  const flush = (): void => {
    timer = undefined;
    if (!active || stopped) return;
    const session = sessionToPersist();
    const key = JSON.stringify(session);
    if (key === lastSaved) return;
    lastSaved = key;
    getApi()
      .session.save(session)
      .catch((error: unknown) => {
        // Retry with the next change instead of believing the failed state was saved.
        lastSaved = null;
        console.error('Could not save the session', error);
      });
  };
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };

  const offDocuments = useDocuments.subscribe(schedule);
  const offSettings = useSettings.subscribe(schedule);
  const start = (): void => {
    active = true;
    schedule();
  };
  ready.then(start, start);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    offDocuments();
    offSettings();
  };
}

async function restoreSession(): Promise<void> {
  const api = getApi();
  const session = await api.session.load();
  if (session === null) return;
  const missing: string[] = [];
  for (const entry of session.documents) {
    try {
      const file = await api.file.read(entry.path);
      useDocuments.getState().openFile(file, entry.mode);
    } catch {
      missing.push(entry.path);
    }
  }
  if (session.activePath !== null) {
    const active = useDocuments.getState().findByPath(session.activePath);
    if (active !== undefined) useDocuments.getState().activate(active.id);
  }
  if (missing.length > 0) {
    useUi
      .getState()
      .pushToast(
        'warning',
        missing.length === 1
          ? `${missing.map(basename).join('')} could not be reopened.`
          : `${missing.length} files could not be reopened.`,
        { detail: missing.join('\n') },
      );
  }
}

/**
 * Application start: loads settings and app info, restores the previous session,
 * opens files passed by the OS and falls back to an empty document when the
 * welcome screen is disabled.
 */
export async function startup(): Promise<void> {
  const api = getApi();
  await useSettings.getState().load();
  const { settings } = useSettings.getState();
  useUi.getState().setOutlineVisible(settings.general.showOutline);
  try {
    const info = await api.app.info();
    useUi.getState().setAppInfo(info);
    useUi.getState().setPlatform(toDesktopPlatform(info.platform));
  } catch (error) {
    toastError('Could not read application info.', error);
  }
  if (settings.editor.restoreSession) {
    try {
      await restoreSession();
    } catch (error) {
      toastError('Could not restore the previous session.', error);
    }
  }
  try {
    openFiles(await api.app.takePendingFiles());
  } catch (error) {
    toastError('Could not open the requested files.', error);
  }
  if (useDocuments.getState().documents.length === 0 && !settings.general.showWelcome) createNewDocument();
}

let closing = false;

/**
 * Window close handshake: resolves unsaved changes of every dirty document,
 * saves the session and tells the main process the window may close. Cancelling
 * any prompt (or a failed save) aborts the close, and the main process is told
 * so it can drop the pending close and any pending application quit.
 * @returns true when the window was allowed to close.
 */
export async function handleCloseRequest(): Promise<boolean> {
  if (closing) return false;
  closing = true;
  try {
    for (const doc of [...useDocuments.getState().documents]) {
      if (!(await resolveUnsaved(doc.id))) {
        try {
          await getApi().app.closeCancelled();
        } catch (error) {
          console.error('Could not cancel the window close', error);
        }
        return false;
      }
    }
    try {
      await saveSession();
    } catch (error) {
      console.error('Could not save the session', error);
    }
    await getApi().app.closeReady();
    return true;
  } finally {
    closing = false;
  }
}

/**
 * Subscribes to main-process events: files to open and close requests.
 * @returns an unsubscribe function.
 */
export function bindAppEvents(): () => void {
  const api = getApi().app;
  const offOpen = api.onOpenFiles((files) => openFiles(files));
  const offClose = api.onCloseRequested(() => void handleCloseRequest());
  return () => {
    offOpen();
    offClose();
  };
}
