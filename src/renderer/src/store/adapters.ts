import type { EditorAdapter } from '@renderer/editor/types';
import { useDocuments } from './documents';

/**
 * Registry of the live editor adapter of each open document. Adapters are
 * imperative objects, so they are kept outside of the reactive stores; React
 * components observe changes through {@link subscribeAdapters}.
 */
const adapters = new Map<string, EditorAdapter>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Registers (or with `null` removes) the adapter of a document. */
export function setAdapter(docId: string, adapter: EditorAdapter | null): void {
  if (adapter === null) {
    if (!adapters.delete(docId)) return;
  } else {
    if (adapters.get(docId) === adapter) return;
    adapters.set(docId, adapter);
  }
  notify();
}

/** The adapter of a document, if its editor is mounted. */
export function getAdapter(docId: string): EditorAdapter | undefined {
  return adapters.get(docId);
}

/** The adapter of the active document, if any. */
export function getActiveAdapter(): EditorAdapter | undefined {
  const { activeId } = useDocuments.getState();
  return activeId === null ? undefined : adapters.get(activeId);
}

/** Subscribes to adapter registrations. Returns an unsubscribe function. */
export function subscribeAdapters(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Monotonic counter that changes on every registration (a `useSyncExternalStore` snapshot). */
export function adaptersVersion(): number {
  return version;
}

/** Removes every registered adapter (used by tests and on full teardown). */
export function clearAdapters(): void {
  adapters.clear();
  notify();
}
