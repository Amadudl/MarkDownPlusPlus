import { useState, type ReactNode, type JSX } from 'react';

/**
 * Two-step destructive button: the first click asks for confirmation inline,
 * the second one runs the action.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  className = 'button',
}: {
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly className?: string;
}): JSX.Element {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="confirm-group" role="group" aria-label="Confirm action">
      <button type="button" className="button" onClick={() => setArmed(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="button button-danger"
        autoFocus
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
    </span>
  );
}
