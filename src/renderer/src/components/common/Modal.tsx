import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type JSX } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  /** Accessible title; rendered as the heading unless `hideTitle` is set. */
  readonly title: string;
  readonly hideTitle?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  /** Selector of the element that receives focus on open (defaults to the first focusable). */
  readonly initialFocus?: string;
}

/**
 * Accessible modal dialog: traps focus, closes on Escape and backdrop click,
 * and restores focus to the previously focused element when it closes.
 */
export function Modal({
  title,
  hideTitle = false,
  onClose,
  children,
  className,
  initialFocus,
}: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef(initialFocus);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const selector = initialFocusRef.current;
    const target =
      (selector === undefined ? null : dialog?.querySelector<HTMLElement>(selector)) ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog;
    target?.focus();
    return () => previous?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={['modal', className].filter(Boolean).join(' ')}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={hideTitle ? 'visually-hidden' : 'modal-title'}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
