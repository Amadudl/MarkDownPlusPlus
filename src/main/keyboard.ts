import type { Event as ElectronEvent, Input } from 'electron';
import { CommandId, isCommandId, type CommandIdValue } from '../shared/commands';
import { shortcutsFor } from '../shared/shortcuts';

/**
 * Deterministic keyboard routing for application shortcuts.
 *
 * Every shortcut of {@link shortcutsFor} is also shown as an accelerator of its
 * native menu item. Left alone, a key press such as `Mod-b` could be handled by
 * the page (ProseMirror / CodeMirror keymaps) *and* by the menu, depending on
 * the OS, and synthetic key presses (Playwright, accessibility tools) never
 * reach native menu accelerators. Instead, the main process inspects every key
 * press in `before-input-event`, and when it matches a shortcut it calls
 * `event.preventDefault()` and sends the command to the renderer itself.
 *
 * Electron documents that `preventDefault()` in `before-input-event` "will
 * prevent the page keydown/keyup events and the menu shortcuts", so each press
 * runs its command exactly once: the page never sees the key and the menu
 * accelerator does not fire. Mouse clicks on menu items are unaffected and
 * still go through the item's `click` handler. Role shortcuts (copy, paste,
 * quit, hide, …) are not in the shortcut table and are never intercepted.
 */

/** The parts of Electron's `Input` the matcher reads. */
export type KeyInput = Pick<
  Input,
  'type' | 'key' | 'code' | 'isAutoRepeat' | 'shift' | 'control' | 'alt' | 'meta'
> &
  Partial<Pick<Input, 'isComposing'>>;

/** An accelerator broken down into physical modifiers and a normalised key name. */
export interface ParsedAccelerator {
  /** Normalised key name (see {@link normalizeKeyName}). */
  readonly key: string;
  /** Command key on macOS, the Windows/Super key elsewhere. */
  readonly meta: boolean;
  readonly control: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

/** A matched shortcut. */
export interface ShortcutMatch {
  readonly command: CommandIdValue;
  /**
   * False for auto-repeated presses of commands that must not repeat (e.g.
   * holding Cmd+B). The key press is still swallowed so the page cannot
   * handle it either; the command is just not sent again.
   */
  readonly dispatch: boolean;
}

/** Commands that keep running while their shortcut is held down. */
export const REPEATABLE_COMMANDS: ReadonlySet<CommandIdValue> = new Set<CommandIdValue>([
  CommandId.EditUndo,
  CommandId.EditRedo,
  CommandId.ViewZoomIn,
  CommandId.ViewZoomOut,
  CommandId.ViewNextTab,
  CommandId.ViewPreviousTab,
]);

/**
 * Accelerators of the menu roles the menu installs (`role: 'hide'`, …), per
 * platform family. A shortcut colliding with one of these is left to the menu
 * so the standard role keeps working (e.g. Cmd+H hides the app on macOS).
 */
export const ROLE_ACCELERATORS: Readonly<Record<'darwin' | 'other', readonly string[]>> = {
  darwin: [
    'Cmd+H',
    'Cmd+Alt+H',
    'Cmd+Q',
    'Cmd+M',
    'Cmd+X',
    'Cmd+C',
    'Cmd+V',
    'Cmd+A',
    'Cmd+Alt+Shift+V',
    'Cmd+Ctrl+F',
    'Cmd+Alt+I',
  ],
  other: ['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+A', 'F11', 'Ctrl+Shift+I'],
};

/** Accelerator key aliases (Electron names → normalised names). */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  plus: '+',
  space: 'space',
  ' ': 'space',
  return: 'enter',
  esc: 'escape',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  del: 'delete',
};

/** `KeyboardEvent.code` values of punctuation keys → the character on a US layout. */
const CODE_CHARACTERS: Readonly<Record<string, string>> = {
  Equal: '=',
  Minus: '-',
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
};

/** Keys that also match the zoom-in `=` shortcut regardless of Shift (US `+` is Shift+`=`, DE `=` is Shift+`0`). */
const PLUS_KEYS: ReadonlySet<string> = new Set(['=', '+']);

/**
 * Normalises a key name from an accelerator or `KeyboardEvent.key`: single
 * characters are lower-cased, named keys are lower-cased and mapped to one
 * canonical spelling (`ArrowUp`/`Up` → `up`, `Esc` → `escape`, `Plus` → `+`).
 */
export function normalizeKeyName(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/**
 * The key a `KeyboardEvent.code` produces without modifiers on a US layout
 * (`KeyB` → `b`, `Digit8` → `8`, `Equal` → `=`, `Tab` → `tab`).
 */
export function keyFromCode(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1] !== undefined) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit?.[1] !== undefined) return digit[1];
  return CODE_CHARACTERS[code] ?? normalizeKeyName(code);
}

/**
 * Parses an Electron accelerator (`CmdOrCtrl+Shift+P`) for `platform`.
 * `CmdOrCtrl` is Meta on macOS and Control elsewhere.
 * @returns null when the accelerator has no key, several keys, or unsupported parts.
 */
export function parseAccelerator(accelerator: string, platform: NodeJS.Platform): ParsedAccelerator | null {
  const mac = platform === 'darwin';
  let meta = false;
  let control = false;
  let alt = false;
  let shift = false;
  let key: string | null = null;
  // A trailing "+" (e.g. "Ctrl++") is the plus key, not a separator.
  const parts = accelerator.endsWith('++')
    ? [...accelerator.slice(0, -2).split('+'), '+']
    : accelerator.split('+');
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'cmdorctrl':
      case 'commandorcontrol':
        if (mac) meta = true;
        else control = true;
        break;
      case 'cmd':
      case 'command':
      case 'meta':
      case 'super':
        meta = true;
        break;
      case 'ctrl':
      case 'control':
        control = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      case 'shift':
        shift = true;
        break;
      case '':
      case 'altgr':
        return null;
      default:
        if (key !== null) return null;
        key = normalizeKeyName(part);
    }
  }
  return key === null ? null : { key, meta, control, alt, shift };
}

function sameAccelerator(a: ParsedAccelerator, b: ParsedAccelerator): boolean {
  return (
    a.key === b.key && a.meta === b.meta && a.control === b.control && a.alt === b.alt && a.shift === b.shift
  );
}

/**
 * Keys a key press may stand for. Besides `input.key`, the unmodified key of
 * the physical position (`input.code`) counts when Shift is held (Shift+8
 * reports `*`) or, on macOS, when Option is held (Option+S reports `ß`). It is
 * not used otherwise so that non-US layouts match by the character printed on
 * the key (a German Cmd+Z is `code: KeyY`), and so that AltGr characters on
 * Windows/Linux (reported as Ctrl+Alt) never trigger shortcuts.
 */
export function inputKeyCandidates(input: KeyInput, platform: NodeJS.Platform): readonly string[] {
  const candidates = [normalizeKeyName(input.key)];
  if (input.shift || (input.alt && platform === 'darwin')) {
    const fromCode = keyFromCode(input.code);
    if (!candidates.includes(fromCode)) candidates.push(fromCode);
  }
  return candidates;
}

function matchesAccelerator(
  accelerator: ParsedAccelerator,
  input: KeyInput,
  candidates: readonly string[],
): boolean {
  if (accelerator.meta !== input.meta || accelerator.control !== input.control) return false;
  if (accelerator.alt !== input.alt) return false;
  if (PLUS_KEYS.has(accelerator.key) && candidates.some((key) => PLUS_KEYS.has(key))) return true;
  return accelerator.shift === input.shift && candidates.includes(accelerator.key);
}

/** Matches key presses against a shortcut table (see {@link createShortcutMatcher}). */
export type ShortcutMatcher = (input: KeyInput) => ShortcutMatch | null;

/**
 * Builds a matcher for `platform` from a shortcut table (default: the
 * platform's effective table, {@link shortcutsFor}). The table is parsed
 * once; unparsable accelerators, unknown command ids and shortcuts colliding
 * with a standard menu role
 * ({@link ROLE_ACCELERATORS}) are ignored. The matcher only reacts to
 * `keyDown` events that are not part of an IME composition.
 */
export function createShortcutMatcher(
  platform: NodeJS.Platform,
  shortcuts: Readonly<Partial<Record<string, string>>> = shortcutsFor(platform),
): ShortcutMatcher {
  const roles = ROLE_ACCELERATORS[platform === 'darwin' ? 'darwin' : 'other']
    .map((accelerator) => parseAccelerator(accelerator, platform))
    .filter((parsed): parsed is ParsedAccelerator => parsed !== null);
  const table: { command: CommandIdValue; accelerator: ParsedAccelerator }[] = [];
  for (const [command, accelerator] of Object.entries(shortcuts)) {
    if (accelerator === undefined || !isCommandId(command)) continue;
    const parsed = parseAccelerator(accelerator, platform);
    if (parsed === null || roles.some((role) => sameAccelerator(role, parsed))) continue;
    table.push({ command, accelerator: parsed });
  }

  return (input) => {
    if (input.type !== 'keyDown' || input.isComposing === true) return null;
    const candidates = inputKeyCandidates(input, platform);
    const entry = table.find(({ accelerator }) => matchesAccelerator(accelerator, input, candidates));
    if (entry === undefined) return null;
    return {
      command: entry.command,
      dispatch: !input.isAutoRepeat || REPEATABLE_COMMANDS.has(entry.command),
    };
  };
}

/** The part of `WebContents` {@link installShortcutRouting} needs. */
export interface KeyboardEventSource {
  on(event: 'before-input-event', listener: (event: ElectronEvent, input: Input) => void): unknown;
}

/**
 * Routes application shortcuts of `contents` through the main process: a
 * matching key press is swallowed (page and menu accelerator) and `dispatch`
 * is called with its command. See the module comment for the reasoning.
 */
export function installShortcutRouting(
  contents: KeyboardEventSource,
  platform: NodeJS.Platform,
  dispatch: (command: CommandIdValue) => void,
): void {
  const match = createShortcutMatcher(platform);
  contents.on('before-input-event', (event, input) => {
    const result = match(input);
    if (result === null) return;
    // Also suppresses the native menu accelerator of the same key (documented Electron behaviour).
    event.preventDefault();
    if (result.dispatch) dispatch(result.command);
  });
}
