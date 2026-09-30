import type { KeyBinding } from '@codemirror/view';
import { shortcutsFor } from '@shared/shortcuts';

/**
 * Application shortcuts are owned by the native menu. CodeMirror's default
 * keymap binds some of the same keys (e.g. `Mod-i` = select parent syntax,
 * `Mod-/` = toggle comment); those bindings are removed so a key press has
 * exactly one meaning everywhere.
 */

const MODIFIER_ORDER = ['ctrl', 'meta', 'alt', 'shift'] as const;

/** True when running on macOS (where `Mod` / `CmdOrCtrl` mean Command). */
export function detectMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** Splits `[...modifiers, key]` (split results are never empty). */
function splitLast(parts: readonly string[]): [modifiers: readonly string[], key: string] {
  return [parts.slice(0, -1), parts.slice(-1).join('')];
}

function canonical(modifiers: ReadonlySet<string>, key: string): string {
  const mods = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...mods, key.toLowerCase()].join('+');
}

/** Normalises an Electron accelerator (`CmdOrCtrl+Shift+Z`) to a canonical `ctrl+shift+z`-style string. */
export function normalizeAccelerator(accelerator: string, isMac: boolean): string {
  const [parts, key] = splitLast(accelerator.split('+'));
  const modifiers = new Set<string>();
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'cmdorctrl':
      case 'commandorcontrol':
        modifiers.add(isMac ? 'meta' : 'ctrl');
        break;
      case 'cmd':
      case 'command':
      case 'super':
      case 'meta':
        modifiers.add('meta');
        break;
      case 'ctrl':
      case 'control':
        modifiers.add('ctrl');
        break;
      case 'alt':
      case 'option':
        modifiers.add('alt');
        break;
      case 'shift':
        modifiers.add('shift');
        break;
    }
  }
  return canonical(modifiers, key);
}

/** Normalises a CodeMirror key name (`Mod-Shift-z`, `c-a`) to the same canonical form. */
export function normalizeCodeMirrorKey(name: string, isMac: boolean): string {
  const [parts, key] = splitLast(name.split(/-(?!$)/));
  const modifiers = new Set<string>();
  for (const part of parts) {
    if (/^(?:cmd|meta|m)$/i.test(part)) modifiers.add('meta');
    else if (/^(?:ctrl|control|c)$/i.test(part)) modifiers.add('ctrl');
    else if (/^(?:alt|a)$/i.test(part)) modifiers.add('alt');
    else if (/^(?:shift|s)$/i.test(part)) modifiers.add('shift');
    else if (/^mod$/i.test(part)) modifiers.add(isMac ? 'meta' : 'ctrl');
  }
  return canonical(modifiers, key);
}

/** Canonical forms of every application shortcut. */
export function reservedKeys(isMac: boolean): ReadonlySet<string> {
  return new Set(
    Object.values(shortcutsFor(isMac ? 'darwin' : 'other')).map((accelerator) =>
      normalizeAccelerator(accelerator, isMac),
    ),
  );
}

function effectiveKey(binding: KeyBinding, isMac: boolean): string | undefined {
  if (isMac) return binding.mac ?? binding.key;
  return binding.win ?? binding.linux ?? binding.key;
}

/** Removes (or strips the `shift` variant of) key bindings that collide with application shortcuts. */
export function withoutReservedKeys(bindings: readonly KeyBinding[], isMac = detectMac()): KeyBinding[] {
  const reserved = reservedKeys(isMac);
  const result: KeyBinding[] = [];
  for (const binding of bindings) {
    const key = effectiveKey(binding, isMac);
    if (key === undefined) {
      result.push(binding);
      continue;
    }
    if (reserved.has(normalizeCodeMirrorKey(key, isMac))) continue;
    if (binding.shift !== undefined && reserved.has(normalizeCodeMirrorKey(`Shift-${key}`, isMac))) {
      const rest: KeyBinding = { ...binding };
      delete rest.shift;
      result.push(rest);
      continue;
    }
    result.push(binding);
  }
  return result;
}
