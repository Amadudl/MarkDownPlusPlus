import type { JSX } from 'react';
import type { CommandIdValue } from '@shared/commands';
import { shortcutLabel } from '@renderer/commands';
import type { DesktopPlatform } from '@renderer/platform/platform';

/** Renders a formatted shortcut such as `⌘⇧P` or `Ctrl+Shift+P`. */
export function Kbd({ children }: { readonly children: string }): JSX.Element {
  return <kbd className="kbd">{children}</kbd>;
}

/** The shortcut of a command as a {@link Kbd}, or nothing when it has none. */
export function ShortcutKbd({
  command,
  platform,
}: {
  readonly command: CommandIdValue;
  readonly platform: DesktopPlatform;
}): JSX.Element | null {
  const label = shortcutLabel(command, platform);
  return label === null ? null : <Kbd>{label}</Kbd>;
}
