import { getApi } from '@renderer/platform/api';
import { applyTheme, resolveTheme } from '@renderer/themes';
import { isDirty, selectActiveDocument, useDocuments, type DocumentsState } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';

/** Product name used in the window title. */
export const APP_NAME = 'MarkDown++';

/** Window title for the current documents: `● name — MarkDown++` when dirty. */
export function windowTitle(state: DocumentsState): string {
  const doc = selectActiveDocument(state);
  if (doc === undefined) return APP_NAME;
  return `${isDirty(doc) ? '● ' : ''}${doc.title} — ${APP_NAME}`;
}

/**
 * Mirrors the active document into the native window title and the "edited"
 * indicator (macOS dot / close confirmation).
 * @returns an unsubscribe function.
 */
export function startWindowTitleSync(): () => void {
  const api = getApi().app;
  let lastTitle: string | null = null;
  let lastDirty: boolean | null = null;
  const report = (error: unknown): void => console.warn('Could not update the window title', error);
  const sync = (state: DocumentsState): void => {
    const title = windowTitle(state);
    if (title !== lastTitle) {
      lastTitle = title;
      document.title = title;
      api.setTitle(title).catch(report);
    }
    const dirty = state.documents.some(isDirty);
    if (dirty !== lastDirty) {
      lastDirty = dirty;
      api.setDirty(dirty).catch(report);
    }
  };
  sync(useDocuments.getState());
  return useDocuments.subscribe(sync);
}

/**
 * Applies the resolved theme and zoom whenever settings or the OS colour scheme change.
 * @returns an unsubscribe function.
 */
export function startAppearanceSync(root: HTMLElement = document.documentElement): () => void {
  let lastSettings: unknown = null;
  let lastDark: boolean | null = null;
  const sync = (): void => {
    const { settings } = useSettings.getState();
    const { prefersDark } = useUi.getState();
    if (settings === lastSettings && prefersDark === lastDark) return;
    lastSettings = settings;
    lastDark = prefersDark;
    applyTheme(root, resolveTheme(settings, prefersDark));
    root.style.setProperty('--mpp-zoom', String(settings.appearance.zoom));
  };
  sync();
  const offSettings = useSettings.subscribe(sync);
  const offUi = useUi.subscribe(sync);
  return () => {
    offSettings();
    offUi();
  };
}
