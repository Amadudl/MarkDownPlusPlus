import type { JSX } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useUi, type ToastKind } from '@renderer/store/ui';

const ICONS: Readonly<Record<ToastKind, LucideIcon>> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

/** Stack of notifications in the bottom-right corner. Errors are announced assertively. */
export function Toasts(): JSX.Element {
  const toasts = useUi((state) => state.toasts);
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            className="toast"
            data-kind={toast.kind}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon className="toast-icon" size={16} strokeWidth={2} aria-hidden="true" />
            <div className="toast-body">
              <p className="toast-message">{toast.message}</p>
              {toast.detail !== undefined && <p className="toast-detail">{toast.detail}</p>}
            </div>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => useUi.getState().dismissToast(toast.id)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
