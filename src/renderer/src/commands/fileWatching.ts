import type { FileChangedEvent } from '@shared/types';
import { getApi } from '@renderer/platform/api';
import { isDirty, useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { reloadDocument } from './documentActions';

/**
 * Reacts to a change on disk: clean documents reload silently, dirty ones show
 * the external-change banner. Events caused by our own saves (same mtime) are ignored.
 */
export async function handleFileChanged(event: FileChangedEvent): Promise<void> {
  const doc = useDocuments.getState().findByPath(event.path);
  if (doc === undefined) return;
  if (event.kind === 'deleted') {
    useDocuments.getState().setExternalChange(doc.id, 'deleted');
    return;
  }
  if (event.mtimeMs === doc.mtimeMs) return;
  if (isDirty(doc)) {
    useDocuments.getState().setExternalChange(doc.id, 'changed');
    return;
  }
  if (await reloadDocument(doc.id)) useUi.getState().pushToast('info', `${doc.title} was updated from disk.`);
}

/**
 * Keeps the main-process file watchers in sync with the open documents and
 * handles change notifications.
 * @returns an unsubscribe function that also stops every watcher.
 */
export function startFileWatching(): () => void {
  const api = getApi();
  const watched = new Set<string>();
  const report = (error: unknown): void => console.warn('File watcher error', error);

  const sync = (): void => {
    const paths = new Set<string>();
    for (const doc of useDocuments.getState().documents) if (doc.path !== null) paths.add(doc.path);
    for (const path of paths) {
      if (!watched.has(path)) {
        watched.add(path);
        api.file.watch(path).catch(report);
      }
    }
    for (const path of [...watched]) {
      if (!paths.has(path)) {
        watched.delete(path);
        api.file.unwatch(path).catch(report);
      }
    }
  };

  sync();
  const offStore = useDocuments.subscribe(sync);
  const offEvents = api.app.onFileChanged((event) => void handleFileChanged(event));
  return () => {
    offStore();
    offEvents();
    for (const path of watched) api.file.unwatch(path).catch(report);
    watched.clear();
  };
}
