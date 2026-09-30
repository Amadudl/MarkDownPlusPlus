import { useDeferredValue, useMemo, type JSX } from 'react';
import { Check, Circle } from 'lucide-react';
import { CommandId } from '@shared/commands';
import type { EditorMode } from '@shared/types';
import type { CursorInfo } from '@renderer/editor/types';
import { documentStats } from '@renderer/editor/markdown-utils';
import { executeCommand } from '@renderer/commands';
import { toggleLineEnding } from '@renderer/commands/documentActions';
import { useActiveDocument } from '@renderer/hooks/useActiveDocument';
import { isDirty, type DocumentTab } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';

const NUMBER = new Intl.NumberFormat('en-US');

/** Formats a reading time in minutes (`< 1 min read`, `4 min read`). */
export function formatReadingTime(minutes: number): string {
  return minutes < 1 ? '< 1 min read' : `${Math.round(minutes)} min read`;
}

/**
 * Cursor text for the status bar. Markdown mode shows the source position; Visual mode
 * has no meaningful line numbers, so it only reports the size of a selection.
 */
export function formatCursor(mode: EditorMode, cursor: CursorInfo): string {
  const count = cursor.selectionLength;
  const selection =
    count === 0 ? '' : `${NUMBER.format(count)} ${count === 1 ? 'character' : 'characters'} selected`;
  if (mode === 'wysiwyg') return selection;
  const position = `Ln ${cursor.line}, Col ${cursor.column}`;
  return selection === '' ? position : `${position} (${selection})`;
}

/**
 * Save state of a document: saved (success colour with a check), unsaved edits (warning
 * colour) or never written to disk (muted, without a check that would suggest safety).
 */
function SaveState({ doc }: { readonly doc: DocumentTab }): JSX.Element {
  const state = isDirty(doc) ? 'unsaved' : doc.path === null ? 'new' : 'saved';
  return (
    <span className="statusbar-item statusbar-saved" data-state={state}>
      {state === 'unsaved' && (
        <>
          <Circle size={8} fill="currentColor" strokeWidth={0} aria-hidden="true" /> Unsaved
        </>
      )}
      {state === 'new' && 'Not saved yet'}
      {state === 'saved' && (
        <>
          <Check size={12} strokeWidth={2.25} aria-hidden="true" /> Saved
        </>
      )}
    </span>
  );
}

/** Bottom bar with document statistics, cursor position, line ending, encoding and zoom. */
export function StatusBar(): JSX.Element {
  const doc = useActiveDocument();
  const zoom = useSettings((state) => state.settings.appearance.zoom);
  const cursor = useUi((state) => (doc === undefined ? undefined : state.cursors[doc.id]));
  const content = useDeferredValue(doc?.content ?? '');
  const stats = useMemo(() => documentStats(content), [content]);
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const characterDetails = `${NUMBER.format(stats.charactersNoSpaces)} without spaces · ${NUMBER.format(stats.lines)} lines`;

  return (
    <footer className="statusbar" aria-label="Status bar">
      {doc === undefined ? (
        <span className="statusbar-item">Ready</span>
      ) : (
        <>
          <button
            type="button"
            className="statusbar-item statusbar-button statusbar-mode"
            aria-description="Toggle Visual / Markdown"
            data-tooltip="Toggle Visual / Markdown"
            data-tooltip-placement="top-start"
            onClick={() => void executeCommand(CommandId.ViewToggleMode)}
          >
            {doc.mode === 'wysiwyg' ? 'Visual' : 'Markdown'}
          </button>
          {cursor !== undefined && formatCursor(doc.mode, cursor) !== '' && (
            <span className="statusbar-item" aria-label="Cursor position">
              {formatCursor(doc.mode, cursor)}
            </span>
          )}
          <span className="statusbar-spacer" />
          <span className="statusbar-item">{NUMBER.format(stats.words)} words</span>
          <span
            className="statusbar-item"
            aria-description={characterDetails}
            data-tooltip={characterDetails}
            data-tooltip-placement="top"
          >
            {NUMBER.format(stats.characters)} characters
          </span>
          <span className="statusbar-item">{formatReadingTime(stats.readingMinutes)}</span>
          <button
            type="button"
            className="statusbar-item statusbar-button"
            aria-label={`Line endings: ${doc.lineEnding.toUpperCase()}. Click to switch.`}
            data-tooltip="Switch line endings (LF / CRLF)"
            data-tooltip-placement="top"
            onClick={() => toggleLineEnding(doc.id)}
          >
            {doc.lineEnding.toUpperCase()}
          </button>
          <span className="statusbar-item">{doc.hasBom ? 'UTF-8 BOM' : 'UTF-8'}</span>
        </>
      )}
      {doc === undefined && <span className="statusbar-spacer" />}
      <button
        type="button"
        className="statusbar-item statusbar-button"
        aria-label={`Zoom ${zoomLabel}. Click to reset.`}
        data-tooltip="Reset zoom"
        data-tooltip-placement="top"
        onClick={() => void executeCommand(CommandId.ViewZoomReset)}
      >
        {zoomLabel}
      </button>
      {doc !== undefined && <SaveState doc={doc} />}
    </footer>
  );
}
