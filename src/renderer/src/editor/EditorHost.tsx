import { type JSX, useEffect, useLayoutEffect, useRef } from 'react';
import type { EditorMode } from '@shared/types';
import type { CursorInfo, EditorAdapter, EditorFactory, EditorOptions } from './types';
import { createSourceEditor } from './source';
import { createWysiwygEditor } from './wysiwyg';

export interface EditorHostProps {
  readonly docId: string;
  readonly mode: EditorMode;
  /**
   * Only read when an editor is mounted (initially and after a mode switch
   * without a newer value) and when {@link EditorHostProps.revision} changes.
   */
  readonly initialMarkdown: string;
  /**
   * Content revision of the document. When it changes (e.g. a reload from
   * disk), the live editor's content is replaced with `initialMarkdown`
   * through `setMarkdown`, which keeps focus, scroll position and the editor
   * instance (a remount would lose them).
   */
  readonly revision: number;
  readonly documentPath: string | null;
  readonly options: Omit<EditorOptions, 'initialMarkdown' | 'documentPath'>;
  /** Inactive hosts stay mounted (keeping undo history and scroll position) but are hidden. */
  readonly active: boolean;
  onChange(docId: string, markdown: string): void;
  onCursorChange(docId: string, info: CursorInfo): void;
  onAdapter(docId: string, adapter: EditorAdapter | null): void;
}

const FACTORIES: Readonly<Record<EditorMode, EditorFactory>> = {
  wysiwyg: createWysiwygEditor,
  source: createSourceEditor,
};

/** How {@link trackAdapter} reads and updates the host's view of the content. */
interface AdapterTracking {
  /** The markdown the editor was mounted with (or last given), used verbatim while unedited. */
  unedited(): string | null;
  /** Called after the adapter's content was replaced through `setMarkdown`. */
  onSetMarkdown(markdown: string): void;
}

/**
 * Wraps an adapter so that content replaced through `setMarkdown` (e.g. a
 * reload from disk) is remembered by the host for the next mode switch, and so
 * that `getMarkdown` returns the loaded markdown verbatim until the user edits
 * it. Editors normalise on load (e.g. `* item` → `- item`); flushing that
 * normalised form into the store would mark an untouched document dirty and
 * trigger an unsaved-changes prompt when the window closes.
 */
function trackAdapter(adapter: EditorAdapter, tracking: AdapterTracking): EditorAdapter {
  return {
    mode: adapter.mode,
    ready: adapter.ready,
    search: adapter.search,
    getMarkdown: () => tracking.unedited() ?? adapter.getMarkdown(),
    setMarkdown(markdown) {
      adapter.setMarkdown(markdown);
      tracking.onSetMarkdown(markdown);
    },
    focus: () => adapter.focus(),
    runCommand: (command) => adapter.runCommand(command),
    undo: () => adapter.undo(),
    redo: () => adapter.redo(),
    scrollToHeading: (index) => adapter.scrollToHeading(index),
    updateOptions: (options) => adapter.updateOptions(options),
    destroy: () => adapter.destroy(),
  };
}

/**
 * Hosts the editor of one open document. The markdown string is the source of
 * truth: switching `mode` serialises the current editor, destroys it and
 * mounts the other editor with that markdown. When the user did not edit
 * anything since the last mount, the previous markdown is reused verbatim so
 * that merely toggling the view never reformats the file.
 *
 * - Keyboard focus follows the mode switch: when the old editor had focus,
 *   the new one is focused once it is ready.
 * - An edit that brings the editor back to its (normalised) loaded content,
 *   e.g. typing a character and deleting it again, reports the original
 *   markdown, so the document is not marked dirty by the editor's
 *   normalisation (`* item` → `- item`).
 */
export function EditorHost(props: EditorHostProps): JSX.Element {
  const { docId, mode, active, documentPath, options, revision } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const markdownRef = useRef(props.initialMarkdown);
  const adapterRef = useRef<EditorAdapter | null>(null);
  const appliedOptions = useRef({ ...options, documentPath });
  const appliedRevision = useRef(revision);
  /** Set while switching modes when the previous editor had keyboard focus. */
  const refocusRef = useRef(false);

  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return undefined;
    const mount = document.createElement('div');
    mount.className = 'mpp-editor-mount';
    host.append(mount);

    let disposed = false;
    let edited = false;
    let isReady = false;
    /** The markdown this editor was given (at mount or through `setMarkdown`), reported verbatim while unedited. */
    let original = markdownRef.current;
    /** The editor's own serialisation of `original` once it is ready (its normalised form). */
    let baseline: string | null = null;
    const current = latest.current;
    appliedOptions.current = { ...current.options, documentPath: current.documentPath };
    const adapter = FACTORIES[mode](
      mount,
      { ...current.options, documentPath: current.documentPath, initialMarkdown: markdownRef.current },
      {
        onChange(markdown) {
          if (disposed) return;
          if (markdown === baseline) {
            // Back at the loaded content: report it verbatim instead of the normalised form.
            edited = false;
            markdownRef.current = original;
            latest.current.onChange(docId, original);
            return;
          }
          edited = true;
          markdownRef.current = markdown;
          latest.current.onChange(docId, markdown);
        },
        onCursorChange(info) {
          if (!disposed) latest.current.onCursorChange(docId, info);
        },
      },
    );
    const tracked = trackAdapter(adapter, {
      unedited: () => (edited ? null : markdownRef.current),
      onSetMarkdown: (markdown) => {
        markdownRef.current = markdown;
        original = markdown;
        edited = false;
        // Before `ready` the baseline is taken once the editor has applied the content.
        baseline = isReady ? adapter.getMarkdown() : null;
      },
    });
    adapterRef.current = tracked;

    adapter.ready.then(
      () => {
        if (disposed) return;
        isReady = true;
        baseline = adapter.getMarkdown();
        latest.current.onAdapter(docId, tracked);
        if (refocusRef.current) {
          refocusRef.current = false;
          if (latest.current.active) tracked.focus();
        }
      },
      (error: unknown) => {
        if (!disposed) console.error(`Failed to start the ${mode} editor`, error);
      },
    );

    return () => {
      disposed = true;
      const active = document.activeElement;
      refocusRef.current = active !== null && active !== document.body && host.contains(active);
      if (edited) {
        try {
          markdownRef.current = adapter.getMarkdown();
        } catch (error) {
          console.error('Failed to serialise the editor content', error);
        }
      }
      adapterRef.current = null;
      adapter.destroy();
      mount.remove();
      latest.current.onAdapter(docId, null);
    };
  }, [docId, mode]);

  useEffect(() => {
    if (appliedRevision.current === revision) return;
    appliedRevision.current = revision;
    // The mount effect above always runs first, so the live adapter exists here.
    adapterRef.current?.setMarkdown(latest.current.initialMarkdown);
  }, [revision]);

  const { spellcheck, tabSize, wordWrap, lineNumbers, loadRemoteImages, placeholder } = options;
  useEffect(() => {
    const next = { spellcheck, tabSize, wordWrap, lineNumbers, loadRemoteImages, placeholder, documentPath };
    const previous = appliedOptions.current;
    const patch = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => previous[key as keyof typeof previous] !== value),
    ) as Partial<typeof next>;
    appliedOptions.current = next;
    if (Object.keys(patch).length > 0) adapterRef.current?.updateOptions(patch);
  }, [spellcheck, tabSize, wordWrap, lineNumbers, loadRemoteImages, placeholder, documentPath]);

  return (
    <div
      ref={hostRef}
      className="mpp-editor-host"
      data-mode={mode}
      data-doc-id={docId}
      data-active={active ? 'true' : 'false'}
      aria-hidden={active ? undefined : true}
      style={active ? undefined : { display: 'none' }}
    />
  );
}
