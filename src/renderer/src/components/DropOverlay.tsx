import type { JSX } from 'react';
import { FileDown } from 'lucide-react';
import { useUi } from '@renderer/store/ui';

/** Full-window hint shown while files are dragged over the window. */
export function DropOverlay(): JSX.Element | null {
  const active = useUi((state) => state.dropActive);
  if (!active) return null;
  return (
    <div className="drop-overlay" role="presentation">
      <div className="drop-overlay-card">
        <FileDown size={32} strokeWidth={1.5} aria-hidden="true" />
        <p>Drop Markdown files to open them</p>
      </div>
    </div>
  );
}
