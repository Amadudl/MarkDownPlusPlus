import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { CommandId } from '../shared/commands';
import { SHORTCUTS, shortcutsFor } from '../shared/shortcuts';
import {
  createShortcutMatcher,
  inputKeyCandidates,
  installShortcutRouting,
  keyFromCode,
  normalizeKeyName,
  parseAccelerator,
  REPEATABLE_COMMANDS,
  ROLE_ACCELERATORS,
  type KeyInput,
} from './keyboard';

function key(partial: Partial<KeyInput> & Pick<KeyInput, 'key' | 'code'>): KeyInput {
  return {
    type: 'keyDown',
    isAutoRepeat: false,
    shift: false,
    control: false,
    alt: false,
    meta: false,
    ...partial,
  };
}

const mac = createShortcutMatcher('darwin');
const win = createShortcutMatcher('win32');
const linux = createShortcutMatcher('linux');

describe('normalizeKeyName', () => {
  it('lower-cases characters and named keys and maps aliases', () => {
    expect(normalizeKeyName('B')).toBe('b');
    expect(normalizeKeyName('Tab')).toBe('tab');
    expect(normalizeKeyName('Plus')).toBe('+');
    expect(normalizeKeyName(' ')).toBe('space');
    expect(normalizeKeyName('Space')).toBe('space');
    expect(normalizeKeyName('Return')).toBe('enter');
    expect(normalizeKeyName('Esc')).toBe('escape');
    expect(normalizeKeyName('ArrowUp')).toBe('up');
    expect(normalizeKeyName('Up')).toBe('up');
    expect(normalizeKeyName('ArrowDown')).toBe('down');
    expect(normalizeKeyName('ArrowLeft')).toBe('left');
    expect(normalizeKeyName('ArrowRight')).toBe('right');
    expect(normalizeKeyName('Del')).toBe('delete');
    expect(normalizeKeyName('F5')).toBe('f5');
  });
});

describe('keyFromCode', () => {
  it('maps letters, digits and punctuation to their US-layout key', () => {
    expect(keyFromCode('KeyB')).toBe('b');
    expect(keyFromCode('Digit8')).toBe('8');
    expect(keyFromCode('Equal')).toBe('=');
    expect(keyFromCode('Minus')).toBe('-');
    expect(keyFromCode('Backquote')).toBe('`');
    expect(keyFromCode('Comma')).toBe(',');
    expect(keyFromCode('Period')).toBe('.');
    expect(keyFromCode('Slash')).toBe('/');
    expect(keyFromCode('Backslash')).toBe('\\');
    expect(keyFromCode('Semicolon')).toBe(';');
    expect(keyFromCode('Quote')).toBe("'");
    expect(keyFromCode('BracketLeft')).toBe('[');
    expect(keyFromCode('BracketRight')).toBe(']');
  });

  it('normalises other codes as key names', () => {
    expect(keyFromCode('Tab')).toBe('tab');
    expect(keyFromCode('ArrowUp')).toBe('up');
    expect(keyFromCode('Numpad8')).toBe('numpad8');
  });
});

describe('parseAccelerator', () => {
  it('maps CmdOrCtrl to Meta on macOS and Control elsewhere', () => {
    expect(parseAccelerator('CmdOrCtrl+Shift+P', 'darwin')).toEqual({
      key: 'p',
      meta: true,
      control: false,
      alt: false,
      shift: true,
    });
    expect(parseAccelerator('CommandOrControl+Alt+S', 'linux')).toEqual({
      key: 's',
      meta: false,
      control: true,
      alt: true,
      shift: false,
    });
  });

  it('understands every modifier spelling', () => {
    for (const meta of ['Cmd', 'Command', 'Meta', 'Super']) {
      expect(parseAccelerator(`${meta}+K`, 'win32')).toMatchObject({ meta: true, control: false });
    }
    expect(parseAccelerator('Ctrl+Tab', 'darwin')).toMatchObject({ key: 'tab', control: true, meta: false });
    expect(parseAccelerator('Control+Option+F5', 'linux')).toMatchObject({
      key: 'f5',
      control: true,
      alt: true,
    });
  });

  it('parses the plus key in both spellings', () => {
    expect(parseAccelerator('Ctrl++', 'linux')).toMatchObject({ key: '+', control: true });
    expect(parseAccelerator('Ctrl+Plus', 'linux')).toMatchObject({ key: '+', control: true });
  });

  it('accepts a bare key', () => {
    expect(parseAccelerator('F11', 'win32')).toEqual({
      key: 'f11',
      meta: false,
      control: false,
      alt: false,
      shift: false,
    });
  });

  it('rejects accelerators without exactly one supported key', () => {
    expect(parseAccelerator('CmdOrCtrl+Shift', 'darwin')).toBeNull();
    expect(parseAccelerator('CmdOrCtrl+A+B', 'darwin')).toBeNull();
    expect(parseAccelerator('AltGr+E', 'linux')).toBeNull();
    expect(parseAccelerator('', 'linux')).toBeNull();
    expect(parseAccelerator('Ctrl++A', 'linux')).toBeNull();
  });

  it('parses every configured shortcut on all platforms', () => {
    for (const accelerator of Object.values(SHORTCUTS)) {
      for (const platform of ['darwin', 'win32', 'linux'] as const) {
        expect(parseAccelerator(accelerator, platform), accelerator).not.toBeNull();
      }
    }
  });
});

describe('inputKeyCandidates', () => {
  it('uses only the reported key without Shift or Option', () => {
    expect(inputKeyCandidates(key({ key: 'z', code: 'KeyY', meta: true }), 'darwin')).toEqual(['z']);
  });

  it('adds the physical key when Shift is held', () => {
    expect(inputKeyCandidates(key({ key: '*', code: 'Digit8', shift: true }), 'linux')).toEqual(['*', '8']);
    expect(inputKeyCandidates(key({ key: 'P', code: 'KeyP', shift: true }), 'linux')).toEqual(['p']);
  });

  it('adds the physical key for Option only on macOS', () => {
    expect(inputKeyCandidates(key({ key: 'ß', code: 'KeyS', alt: true }), 'darwin')).toEqual(['ß', 's']);
    expect(inputKeyCandidates(key({ key: '}', code: 'Digit0', alt: true, control: true }), 'win32')).toEqual([
      '}',
    ]);
  });
});

describe('createShortcutMatcher', () => {
  it('matches CmdOrCtrl as Command on macOS and Control elsewhere', () => {
    expect(mac(key({ key: 'b', code: 'KeyB', meta: true }))).toEqual({
      command: CommandId.FormatBold,
      dispatch: true,
    });
    expect(mac(key({ key: 'b', code: 'KeyB', control: true }))).toBeNull();
    expect(win(key({ key: 'b', code: 'KeyB', control: true }))?.command).toBe(CommandId.FormatBold);
    expect(win(key({ key: 'b', code: 'KeyB', meta: true }))).toBeNull();
  });

  it('matches letters case-insensitively and requires the exact modifiers', () => {
    expect(mac(key({ key: 'S', code: 'KeyS', meta: true, shift: true }))?.command).toBe(CommandId.FileSaveAs);
    expect(mac(key({ key: 's', code: 'KeyS', meta: true }))?.command).toBe(CommandId.FileSave);
    expect(mac(key({ key: 'ß', code: 'KeyS', meta: true, alt: true }))?.command).toBe(CommandId.FileSaveAll);
    expect(linux(key({ key: 's', code: 'KeyS', control: true, alt: true }))?.command).toBe(
      CommandId.FileSaveAll,
    );
    expect(mac(key({ key: 's', code: 'KeyS', meta: true, control: true }))).toBeNull();
    expect(mac(key({ key: 's', code: 'KeyS' }))).toBeNull();
  });

  it('matches digits, punctuation and Tab', () => {
    expect(mac(key({ key: '1', code: 'Digit1', meta: true }))?.command).toBe(CommandId.FormatHeading1);
    expect(mac(key({ key: '0', code: 'Digit0', meta: true }))?.command).toBe(CommandId.ViewZoomReset);
    expect(mac(key({ key: 'º', code: 'Digit0', meta: true, alt: true }))?.command).toBe(
      CommandId.FormatParagraph,
    );
    expect(mac(key({ key: '-', code: 'Minus', meta: true }))?.command).toBe(CommandId.ViewZoomOut);
    // Cmd+` cycles through windows on macOS; Inline Code is Ctrl+` there.
    expect(mac(key({ key: '`', code: 'Backquote', meta: true }))).toBeNull();
    expect(mac(key({ key: '`', code: 'Backquote', control: true }))?.command).toBe(
      CommandId.FormatInlineCode,
    );
    expect(win(key({ key: '`', code: 'Backquote', control: true }))?.command).toBe(
      CommandId.FormatInlineCode,
    );
    expect(mac(key({ key: ',', code: 'Comma', meta: true }))?.command).toBe(CommandId.SettingsOpen);
    expect(mac(key({ key: '/', code: 'Slash', meta: true }))?.command).toBe(CommandId.HelpShortcuts);
    expect(win(key({ key: 'Tab', code: 'Tab', control: true }))?.command).toBe(CommandId.ViewNextTab);
    expect(mac(key({ key: 'Tab', code: 'Tab', control: true }))?.command).toBe(CommandId.ViewNextTab);
    expect(win(key({ key: 'Tab', code: 'Tab', control: true, shift: true }))?.command).toBe(
      CommandId.ViewPreviousTab,
    );
  });

  it('matches shifted digits through the physical key', () => {
    expect(mac(key({ key: '*', code: 'Digit8', meta: true, shift: true }))?.command).toBe(
      CommandId.FormatBulletList,
    );
    expect(win(key({ key: '&', code: 'Digit7', control: true, shift: true }))?.command).toBe(
      CommandId.FormatOrderedList,
    );
    // German layout: Shift+7 is "/" — still the numbered list, not the shortcut sheet.
    expect(win(key({ key: '/', code: 'Digit7', control: true, shift: true }))?.command).toBe(
      CommandId.FormatOrderedList,
    );
    expect(mac(key({ key: '(', code: 'Digit9', meta: true, shift: true }))?.command).toBe(
      CommandId.FormatTaskList,
    );
  });

  it('matches by the printed character on non-US layouts', () => {
    // German QWERTZ: the key labelled Z sits where US has Y.
    expect(mac(key({ key: 'z', code: 'KeyY', meta: true }))?.command).toBe(CommandId.EditUndo);
    expect(mac(key({ key: 'y', code: 'KeyZ', meta: true }))).toBeNull();
  });

  it('accepts = and + for zoom in, with or without Shift', () => {
    expect(mac(key({ key: '=', code: 'Equal', meta: true }))?.command).toBe(CommandId.ViewZoomIn);
    expect(mac(key({ key: '+', code: 'Equal', meta: true, shift: true }))?.command).toBe(
      CommandId.ViewZoomIn,
    );
    expect(win(key({ key: '+', code: 'BracketRight', control: true }))?.command).toBe(CommandId.ViewZoomIn);
    expect(win(key({ key: '=', code: 'Digit0', control: true, shift: true }))?.command).toBe(
      CommandId.ViewZoomIn,
    );
    expect(win(key({ key: '=', code: 'Equal', control: true, alt: true }))).toBeNull();
  });

  it('never treats AltGr characters on Windows as shortcuts', () => {
    // German AltGr+0 types "}" and is reported as Ctrl+Alt+0.
    expect(win(key({ key: '}', code: 'Digit0', control: true, alt: true }))).toBeNull();
  });

  it('ignores key-up events, IME composition and unbound keys', () => {
    expect(mac(key({ key: 'b', code: 'KeyB', meta: true, type: 'keyUp' }))).toBeNull();
    expect(mac(key({ key: 'b', code: 'KeyB', meta: true, isComposing: true }))).toBeNull();
    expect(mac(key({ key: 'j', code: 'KeyJ', meta: true }))).toBeNull();
    expect(mac(key({ key: 'b', code: 'KeyB' }))).toBeNull();
  });

  it('swallows but does not repeat non-repeatable commands', () => {
    expect(mac(key({ key: 'b', code: 'KeyB', meta: true, isAutoRepeat: true }))).toEqual({
      command: CommandId.FormatBold,
      dispatch: false,
    });
    expect(mac(key({ key: 'z', code: 'KeyZ', meta: true, isAutoRepeat: true }))).toEqual({
      command: CommandId.EditUndo,
      dispatch: true,
    });
    expect(mac(key({ key: 'Z', code: 'KeyZ', meta: true, shift: true, isAutoRepeat: true }))).toEqual({
      command: CommandId.EditRedo,
      dispatch: true,
    });
  });

  it('leaves standard role shortcuts to the menu', () => {
    expect(mac(key({ key: 'h', code: 'KeyH', meta: true }))).toBeNull();
    expect(mac(key({ key: 'q', code: 'KeyQ', meta: true }))).toBeNull();
    expect(mac(key({ key: 'c', code: 'KeyC', meta: true }))).toBeNull();
    expect(win(key({ key: 'h', code: 'KeyH', control: true }))?.command).toBe(CommandId.EditReplace);
    expect(win(key({ key: 'v', code: 'KeyV', control: true }))).toBeNull();
  });

  it('routes Find and Replace to Cmd+Option+F on macOS (Cmd+H is Hide)', () => {
    expect(mac(key({ key: 'ƒ', code: 'KeyF', meta: true, alt: true }))?.command).toBe(CommandId.EditReplace);
    expect(mac(key({ key: 'f', code: 'KeyF', meta: true }))?.command).toBe(CommandId.EditFind);
    expect(win(key({ key: 'f', code: 'KeyF', control: true, alt: true }))).toBeNull();
  });

  it('skips unknown commands, missing and invalid accelerators in custom tables', () => {
    const matcher = createShortcutMatcher('linux', {
      'no-such-command': 'Ctrl+J',
      [CommandId.FileNew]: undefined,
      [CommandId.FileOpen]: 'Ctrl+A+B',
      [CommandId.FileSave]: 'Ctrl+J',
    });
    expect(matcher(key({ key: 'j', code: 'KeyJ', control: true }))?.command).toBe(CommandId.FileSave);
    expect(matcher(key({ key: 'n', code: 'KeyN', control: true }))).toBeNull();
  });

  it('routes every effective shortcut, none of which collides with a menu role', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const matcher = createShortcutMatcher(platform);
      const reserved = ROLE_ACCELERATORS[platform === 'darwin' ? 'darwin' : 'other'].map((accelerator) =>
        parseAccelerator(accelerator, platform),
      );
      for (const [command, accelerator] of Object.entries(shortcutsFor(platform))) {
        const parsed = parseAccelerator(accelerator, platform);
        if (parsed === null) throw new Error(accelerator);
        const isReserved = reserved.some((role) => JSON.stringify(role) === JSON.stringify(parsed));
        const code = /^[a-z]$/.test(parsed.key)
          ? `Key${parsed.key.toUpperCase()}`
          : /^[0-9]$/.test(parsed.key)
            ? `Digit${parsed.key}`
            : parsed.key === 'tab'
              ? 'Tab'
              : 'Unidentified';
        const result = matcher(
          key({
            key: parsed.key === 'tab' ? 'Tab' : parsed.key,
            code,
            meta: parsed.meta,
            control: parsed.control,
            alt: parsed.alt,
            shift: parsed.shift,
          }),
        );
        expect(isReserved, `${platform} ${accelerator} collides with a menu role`).toBe(false);
        expect(result?.command, `${platform} ${accelerator}`).toBe(command);
      }
    }
  });

  it('lists only valid role accelerators', () => {
    for (const accelerator of ROLE_ACCELERATORS.darwin)
      expect(parseAccelerator(accelerator, 'darwin')).not.toBeNull();
    for (const accelerator of ROLE_ACCELERATORS.other)
      expect(parseAccelerator(accelerator, 'linux')).not.toBeNull();
  });

  it('lists only bound commands as repeatable', () => {
    for (const command of REPEATABLE_COMMANDS) expect(SHORTCUTS[command]).toBeDefined();
  });
});

describe('installShortcutRouting', () => {
  function setup() {
    const contents = new EventEmitter();
    const dispatch = vi.fn();
    installShortcutRouting(contents, 'darwin', dispatch);
    const press = (input: KeyInput) => {
      const event = { preventDefault: vi.fn() };
      contents.emit('before-input-event', event, input);
      return event;
    };
    return { dispatch, press };
  }

  it('swallows matching presses and dispatches their command once', () => {
    const { dispatch, press } = setup();
    const event = press(key({ key: 'b', code: 'KeyB', meta: true }));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(CommandId.FormatBold);
  });

  it('swallows auto-repeats of non-repeatable commands without dispatching', () => {
    const { dispatch, press } = setup();
    const event = press(key({ key: 'b', code: 'KeyB', meta: true, isAutoRepeat: true }));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('lets every other key through to the page and the menu', () => {
    const { dispatch, press } = setup();
    for (const input of [
      key({ key: 'b', code: 'KeyB' }),
      key({ key: 'c', code: 'KeyC', meta: true }),
      key({ key: 'b', code: 'KeyB', meta: true, type: 'keyUp' }),
    ]) {
      expect(press(input).preventDefault).not.toHaveBeenCalled();
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
});
