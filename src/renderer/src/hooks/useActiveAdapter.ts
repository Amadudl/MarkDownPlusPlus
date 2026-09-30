import { useSyncExternalStore } from 'react';
import type { EditorAdapter } from '@renderer/editor/types';
import { adaptersVersion, getAdapter, subscribeAdapters } from '@renderer/store/adapters';
import { useDocuments } from '@renderer/store/documents';

/** The editor adapter of the active document; re-renders when it is (re)mounted. */
export function useActiveAdapter(): EditorAdapter | undefined {
  useSyncExternalStore(subscribeAdapters, adaptersVersion);
  const activeId = useDocuments((state) => state.activeId);
  return activeId === null ? undefined : getAdapter(activeId);
}
