import type { JSX } from 'react';
import { FileWarning } from 'lucide-react';
import { closeDocument, reloadDocument } from '@renderer/commands/documentActions';
import { useDocuments, type DocumentTab } from '@renderer/store/documents';

/** Shown above a document whose file changed or disappeared on disk while it had unsaved edits. */
export function ExternalChangeBanner({ doc }: { readonly doc: DocumentTab }): JSX.Element | null {
  if (doc.externalChange === 'none') return null;
  const store = useDocuments.getState;
  const deleted = doc.externalChange === 'deleted';
  return (
    <div className="change-banner" role="alert" data-kind={doc.externalChange}>
      <FileWarning size={16} strokeWidth={1.75} aria-hidden="true" />
      <p className="change-banner-text">
        <strong>{doc.title}</strong>{' '}
        {deleted
          ? 'was deleted or moved on disk.'
          : 'was changed on disk by another program. Your version has unsaved edits.'}
      </p>
      <div className="change-banner-actions">
        {deleted ? (
          <>
            <button
              type="button"
              className="button button-primary"
              onClick={() => store().keepDeleted(doc.id)}
            >
              Keep as unsaved
            </button>
            <button type="button" className="button" onClick={() => void closeDocument(doc.id)}>
              Close
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void reloadDocument(doc.id)}
            >
              Reload from disk
            </button>
            <button
              type="button"
              className="button"
              onClick={() => store().setExternalChange(doc.id, 'none')}
            >
              Keep mine
            </button>
          </>
        )}
      </div>
    </div>
  );
}
