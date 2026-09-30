import type { EditorMode } from '@shared/types';
import type { FormatCommand } from '@renderer/editor/types';
import { getActiveAdapter } from '@renderer/store/adapters';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';

/** Smallest and largest window zoom factor. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
/** Increment used by zoom in / zoom out. */
export const ZOOM_STEP = 0.1;

/** Clamps and rounds a zoom factor to one decimal. */
export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 10) / 10));
}

/** Changes the window zoom by `delta` (persisted in the settings). */
export async function zoomBy(delta: number): Promise<void> {
  const current = useSettings.getState().settings.appearance.zoom;
  const next = clampZoom(current + delta);
  if (next !== current) await useSettings.getState().update({ appearance: { zoom: next } });
}

/** Restores 100% zoom. */
export async function resetZoom(): Promise<void> {
  if (useSettings.getState().settings.appearance.zoom !== 1) {
    await useSettings.getState().update({ appearance: { zoom: 1 } });
  }
}

/** Switches the active document to the given editor mode. */
export function setActiveMode(mode: EditorMode): void {
  const doc = selectActiveDocument(useDocuments.getState());
  if (doc !== undefined && doc.mode !== mode) useDocuments.getState().setMode(doc.id, mode);
}

/** Flips the active document between the visual and the markdown editor. */
export function toggleActiveMode(): void {
  const doc = selectActiveDocument(useDocuments.getState());
  if (doc !== undefined) setActiveMode(doc.mode === 'wysiwyg' ? 'source' : 'wysiwyg');
}

/** Shows or hides the outline and remembers the choice. */
export async function toggleOutline(): Promise<void> {
  const visible = !useUi.getState().outlineVisible;
  useUi.getState().setOutlineVisible(visible);
  await useSettings.getState().update({ general: { showOutline: visible } });
}

/** Applies a formatting command to the active editor. */
export function runFormat(command: FormatCommand): boolean {
  const adapter = getActiveAdapter();
  if (adapter === undefined) return false;
  adapter.focus();
  return adapter.runCommand(command);
}

function focusedTextField(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return active;
  if (active instanceof HTMLInputElement && ['text', 'search', 'url', 'email', ''].includes(active.type)) {
    return active;
  }
  return null;
}

/**
 * Undo/redo: plain text fields of the shell (find bar, dialogs) use the browser's
 * native history, everything else goes to the active editor.
 */
export function runHistory(direction: 'undo' | 'redo'): boolean {
  if (focusedTextField() !== null) {
    // execCommand is the only API that drives the native undo stack of <input>/<textarea> elements.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand(direction);
  }
  const adapter = getActiveAdapter();
  if (adapter === undefined) return false;
  return direction === 'undo' ? adapter.undo() : adapter.redo();
}
