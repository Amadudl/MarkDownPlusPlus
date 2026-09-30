import { create } from 'zustand';
import type { EditorMode, FileReadResult, LineEnding } from '@shared/types';
import { basename } from '@renderer/platform/paths';

/** State of a file relative to its copy on disk, reported by the file watcher. */
export type ExternalChange = 'none' | 'changed' | 'deleted';

/** One open tab. The markdown string is the single source of truth. */
export interface DocumentTab {
  readonly id: string;
  /** Absolute path on disk, `null` for untitled documents. */
  readonly path: string | null;
  readonly title: string;
  /** Latest markdown as edited. */
  readonly content: string;
  /** Markdown as last loaded from or written to disk. */
  readonly savedContent: string;
  readonly mode: EditorMode;
  readonly lineEnding: LineEnding;
  /** Line ending the file had when it was last saved or loaded. */
  readonly savedLineEnding: LineEnding;
  readonly hasBom: boolean;
  readonly mtimeMs: number;
  readonly externalChange: ExternalChange;
  /** True when the file was deleted on disk but the user chose to keep the document. */
  readonly diskMissing: boolean;
  /** Incremented when content is replaced from outside the editor (reload); the editor then loads `content`. */
  readonly revision: number;
}

export interface NewDocumentOptions {
  readonly mode: EditorMode;
  readonly lineEnding: LineEnding;
  readonly content?: string;
  /** Overrides the generated `Untitled-n` title. */
  readonly title?: string;
}

export interface SavedInfo {
  readonly path: string;
  readonly mtimeMs: number;
  /** The exact content that was written. */
  readonly content: string;
}

export interface DocumentsState {
  readonly documents: readonly DocumentTab[];
  readonly activeId: string | null;
  readonly untitledCounter: number;
  /** Opens a file from disk; when it is already open the existing tab is activated. Returns the tab id. */
  openFile(file: FileReadResult, mode: EditorMode): string;
  /** Creates an untitled document and activates it. Returns the tab id. */
  newDocument(options: NewDocumentOptions): string;
  activate(id: string): void;
  close(id: string): void;
  closeAll(): void;
  /** Moves the tab `id` to the position currently held by `targetId`. */
  reorder(id: string, targetId: string): void;
  updateContent(id: string, content: string): void;
  markSaved(id: string, info: SavedInfo): void;
  setMode(id: string, mode: EditorMode): void;
  setLineEnding(id: string, lineEnding: LineEnding): void;
  setExternalChange(id: string, change: ExternalChange): void;
  /** Keeps a document whose file was deleted on disk; it stays dirty until saved again. */
  keepDeleted(id: string): void;
  /**
   * Turns a document into an untitled one that keeps its content (and stays dirty), e.g.
   * when another tab was saved over its file. The title is kept so the user recognises it.
   */
  detach(id: string): void;
  /** Replaces a document with a fresh copy from disk (after an external change). */
  reloadFromDisk(id: string, file: FileReadResult): void;
  findByPath(path: string): DocumentTab | undefined;
  nextTab(): void;
  previousTab(): void;
}

/** A document is dirty when its content or line ending differs from what is on disk. */
export function isDirty(doc: DocumentTab): boolean {
  return doc.content !== doc.savedContent || doc.lineEnding !== doc.savedLineEnding || doc.diskMissing;
}

/** Compares paths case-insensitively on Windows-style paths, exactly elsewhere. */
export function samePath(a: string, b: string): boolean {
  const windowsLike = /^[a-zA-Z]:[\\/]|^\\\\/.test(a);
  const normalize = (value: string): string =>
    windowsLike ? value.replace(/\//g, '\\').toLowerCase() : value;
  return normalize(a) === normalize(b);
}

let idSequence = 0;
function nextId(): string {
  idSequence += 1;
  return `doc-${Date.now().toString(36)}-${idSequence}`;
}

function patchDocument(
  documents: readonly DocumentTab[],
  id: string,
  patch: (doc: DocumentTab) => DocumentTab,
): readonly DocumentTab[] {
  return documents.map((doc) => (doc.id === id ? patch(doc) : doc));
}

/** Initial state, exported so tests can reset the store. */
export const INITIAL_DOCUMENTS_STATE = { documents: [], activeId: null, untitledCounter: 0 } as const;

/** Store of open documents (tabs). All operations are synchronous and pure state transitions. */
export const useDocuments = create<DocumentsState>()((set, get) => ({
  ...INITIAL_DOCUMENTS_STATE,

  openFile(file, mode) {
    const existing = get().findByPath(file.path);
    if (existing !== undefined) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const doc: DocumentTab = {
      id: nextId(),
      path: file.path,
      title: basename(file.path),
      content: file.content,
      savedContent: file.content,
      mode,
      lineEnding: file.lineEnding,
      savedLineEnding: file.lineEnding,
      hasBom: file.hasBom,
      mtimeMs: file.mtimeMs,
      externalChange: 'none',
      diskMissing: false,
      revision: 0,
    };
    set((state) => ({ documents: [...state.documents, doc], activeId: doc.id }));
    return doc.id;
  },

  newDocument(options) {
    const counter = get().untitledCounter + 1;
    const content = options.content ?? '';
    const doc: DocumentTab = {
      id: nextId(),
      path: null,
      title: options.title ?? `Untitled-${counter}`,
      content,
      savedContent: content,
      mode: options.mode,
      lineEnding: options.lineEnding,
      savedLineEnding: options.lineEnding,
      hasBom: false,
      mtimeMs: 0,
      externalChange: 'none',
      diskMissing: false,
      revision: 0,
    };
    set((state) => ({
      documents: [...state.documents, doc],
      activeId: doc.id,
      untitledCounter: options.title === undefined ? counter : state.untitledCounter,
    }));
    return doc.id;
  },

  activate(id) {
    if (get().documents.some((doc) => doc.id === id)) set({ activeId: id });
  },

  close(id) {
    const { documents, activeId } = get();
    const index = documents.findIndex((doc) => doc.id === id);
    if (index === -1) return;
    const remaining = documents.filter((doc) => doc.id !== id);
    let nextActive = activeId;
    if (activeId === id) {
      const neighbour = remaining[Math.min(index, remaining.length - 1)];
      nextActive = neighbour?.id ?? null;
    }
    set({ documents: remaining, activeId: nextActive });
  },

  closeAll() {
    set({ documents: [], activeId: null });
  },

  reorder(id, targetId) {
    if (id === targetId) return;
    const documents = [...get().documents];
    const from = documents.findIndex((doc) => doc.id === id);
    const to = documents.findIndex((doc) => doc.id === targetId);
    if (from === -1 || to === -1) return;
    documents.splice(to, 0, ...documents.splice(from, 1));
    set({ documents });
  },

  updateContent(id, content) {
    set((state) => ({
      documents: patchDocument(state.documents, id, (doc) =>
        doc.content === content ? doc : { ...doc, content },
      ),
    }));
  },

  markSaved(id, info) {
    set((state) => ({
      documents: patchDocument(state.documents, id, (doc) => ({
        ...doc,
        path: info.path,
        title: basename(info.path),
        savedContent: info.content,
        savedLineEnding: doc.lineEnding,
        mtimeMs: info.mtimeMs,
        externalChange: 'none',
        diskMissing: false,
      })),
    }));
  },

  setMode(id, mode) {
    set((state) => ({ documents: patchDocument(state.documents, id, (doc) => ({ ...doc, mode })) }));
  },

  setLineEnding(id, lineEnding) {
    set((state) => ({ documents: patchDocument(state.documents, id, (doc) => ({ ...doc, lineEnding })) }));
  },

  setExternalChange(id, change) {
    set((state) => ({
      documents: patchDocument(state.documents, id, (doc) => ({ ...doc, externalChange: change })),
    }));
  },

  keepDeleted(id) {
    set((state) => ({
      documents: patchDocument(state.documents, id, (doc) => ({
        ...doc,
        externalChange: 'none',
        diskMissing: true,
      })),
    }));
  },

  detach(id) {
    set((state) => ({
      documents: patchDocument(state.documents, id, (doc) => ({
        ...doc,
        path: null,
        savedContent: '',
        mtimeMs: 0,
        externalChange: 'none',
        diskMissing: false,
      })),
    }));
  },

  reloadFromDisk(id, file) {
    set((state) => ({
      documents: patchDocument(state.documents, id, (doc) => ({
        ...doc,
        content: file.content,
        savedContent: file.content,
        lineEnding: file.lineEnding,
        savedLineEnding: file.lineEnding,
        hasBom: file.hasBom,
        mtimeMs: file.mtimeMs,
        externalChange: 'none',
        diskMissing: false,
        revision: doc.revision + 1,
      })),
    }));
  },

  findByPath(path) {
    return get().documents.find((doc) => doc.path !== null && samePath(doc.path, path));
  },

  nextTab() {
    cycle(1);
  },

  previousTab() {
    cycle(-1);
  },
}));

function cycle(step: 1 | -1): void {
  const { documents, activeId } = useDocuments.getState();
  if (documents.length === 0) return;
  const index = documents.findIndex((doc) => doc.id === activeId);
  const start = index === -1 ? (step === 1 ? -1 : 0) : index;
  const next = documents[(start + step + documents.length) % documents.length];
  if (next !== undefined) useDocuments.setState({ activeId: next.id });
}

/** The active document or `undefined`. */
export function selectActiveDocument(state: DocumentsState): DocumentTab | undefined {
  return state.documents.find((doc) => doc.id === state.activeId);
}
