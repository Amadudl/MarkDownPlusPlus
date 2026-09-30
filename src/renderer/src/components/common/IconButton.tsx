import type { ButtonHTMLAttributes, ReactNode, JSX } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name, also shown as tooltip. */
  readonly label: string;
  readonly icon: LucideIcon;
  /** Formatted shortcut shown next to the tooltip text. */
  readonly shortcut?: string | null;
  /** When defined the button is a toggle (`aria-pressed`). */
  readonly pressed?: boolean;
  /**
   * Where the tooltip opens: centred below (`bottom`, default) or above (`top`) the button,
   * or below and aligned to its right (`left`, grows leftwards) or left (`start`, grows
   * rightwards) edge — use those two next to the window edges so the tooltip is not clipped.
   */
  readonly tooltipPlacement?: 'top' | 'bottom' | 'left' | 'start';
  readonly iconSize?: number;
  readonly children?: ReactNode;
}

/** Square icon button with an accessible name and a CSS tooltip. */
export function IconButton({
  label,
  icon: Icon,
  shortcut,
  pressed,
  tooltipPlacement = 'bottom',
  iconSize = 16,
  className,
  children,
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
      data-shortcut={shortcut ?? undefined}
      data-tooltip-placement={tooltipPlacement}
      className={['icon-button', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </button>
  );
}
