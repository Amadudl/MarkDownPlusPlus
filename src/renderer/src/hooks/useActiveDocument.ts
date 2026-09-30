import { selectActiveDocument, useDocuments, type DocumentTab } from '@renderer/store/documents';

/** The active document (re-renders when it changes). */
export function useActiveDocument(): DocumentTab | undefined {
  return useDocuments(selectActiveDocument);
}
