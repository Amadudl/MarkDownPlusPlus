import { isDirty, useDocuments, type DocumentTab } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { saveDocument } from './documentActions';

function canAutoSave(doc: DocumentTab): boolean {
  return doc.path !== null && isDirty(doc) && doc.externalChange === 'none';
}

/**
 * Auto save for documents that already have a path:
 * `afterDelay` saves a document once it has not changed for the configured delay,
 * `onFocusChange` saves every dirty document when the window loses focus.
 * @returns an unsubscribe function.
 */
export function startAutoSave(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const schedule = (doc: DocumentTab, delay: number): void => {
    const pending = timers.get(doc.id);
    if (pending !== undefined) clearTimeout(pending);
    timers.set(
      doc.id,
      setTimeout(() => {
        timers.delete(doc.id);
        const current = useDocuments.getState().documents.find((item) => item.id === doc.id);
        if (current !== undefined && canAutoSave(current)) void saveDocument(doc.id);
      }, delay),
    );
  };

  const offStore = useDocuments.subscribe((state, previous) => {
    const { autoSave, autoSaveDelayMs } = useSettings.getState().settings.editor;
    if (autoSave !== 'afterDelay') return;
    for (const doc of state.documents) {
      const before = previous.documents.find((item) => item.id === doc.id);
      if (before?.content === doc.content && before.lineEnding === doc.lineEnding) continue;
      if (canAutoSave(doc)) schedule(doc, autoSaveDelayMs);
    }
  });

  const onBlur = (): void => {
    if (useSettings.getState().settings.editor.autoSave !== 'onFocusChange') return;
    for (const doc of useDocuments.getState().documents) if (canAutoSave(doc)) void saveDocument(doc.id);
  };
  window.addEventListener('blur', onBlur);

  return () => {
    offStore();
    window.removeEventListener('blur', onBlur);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
