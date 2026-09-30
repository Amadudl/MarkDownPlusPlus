import type { KeyBinding } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectMac,
  normalizeAccelerator,
  normalizeCodeMirrorKey,
  reservedKeys,
  withoutReservedKeys,
} from './keymap';

const run = (): boolean => true;

describe('normalizeAccelerator', () => {
  it('maps CmdOrCtrl per platform and orders modifiers canonically', () => {
    expect(normalizeAccelerator('CmdOrCtrl+Shift+Z', true)).toBe('meta+shift+z');
    expect(normalizeAccelerator('Shift+CommandOrControl+Z', false)).toBe('ctrl+shift+z');
  });

  it('understands every modifier alias and keeps unknown parts out', () => {
    expect(normalizeAccelerator('Cmd+Alt+K', true)).toBe('meta+alt+k');
    expect(normalizeAccelerator('Command+Option+K', true)).toBe('meta+alt+k');
    expect(normalizeAccelerator('Super+K', false)).toBe('meta+k');
    expect(normalizeAccelerator('Meta+K', false)).toBe('meta+k');
    expect(normalizeAccelerator('Control+Tab', true)).toBe('ctrl+tab');
    expect(normalizeAccelerator('Ctrl+Hyper+-', false)).toBe('ctrl+-');
  });
});

describe('normalizeCodeMirrorKey', () => {
  it('maps Mod per platform and supports short modifier names', () => {
    expect(normalizeCodeMirrorKey('Mod-Shift-z', true)).toBe('meta+shift+z');
    expect(normalizeCodeMirrorKey('Mod-Shift-z', false)).toBe('ctrl+shift+z');
    expect(normalizeCodeMirrorKey('c-a-s-m-x', false)).toBe('ctrl+meta+alt+shift+x');
    expect(normalizeCodeMirrorKey('Cmd-Control-Alt-Shift-Enter', true)).toBe('ctrl+meta+alt+shift+enter');
    expect(normalizeCodeMirrorKey('Mod--', false)).toBe('ctrl+-');
    expect(normalizeCodeMirrorKey('Weird-x', false)).toBe('x');
  });
});

describe('reservedKeys', () => {
  it('contains the application shortcuts', () => {
    const keys = reservedKeys(false);
    expect(keys.has('ctrl+b')).toBe(true);
    expect(keys.has('ctrl+shift+z')).toBe(true);
    expect(reservedKeys(true).has('meta+i')).toBe(true);
  });

  it('uses the platform table (Find and Replace is Cmd+Option+F on macOS)', () => {
    expect(reservedKeys(true).has('meta+alt+f')).toBe(true);
    expect(reservedKeys(true).has('meta+h')).toBe(false);
    expect(reservedKeys(false).has('ctrl+h')).toBe(true);
    expect(reservedKeys(false).has('ctrl+alt+f')).toBe(false);
  });
});

describe('withoutReservedKeys', () => {
  it('removes bindings that collide with application shortcuts', () => {
    const bindings: KeyBinding[] = [
      { key: 'Mod-i', run },
      { key: 'Mod-/', run },
      { key: 'Alt-ArrowUp', run },
      { run },
    ];
    expect(withoutReservedKeys(bindings, false).map((binding) => binding.key)).toEqual([
      'Alt-ArrowUp',
      undefined,
    ]);
  });

  it('honours platform-specific keys', () => {
    const bindings: KeyBinding[] = [
      { key: 'Ctrl-y', mac: 'Mod-b', run },
      { key: 'Mod-y', win: 'Ctrl-b', run },
    ];
    expect(withoutReservedKeys(bindings, true)).toEqual([bindings[1]]);
    expect(withoutReservedKeys(bindings, false)).toEqual([bindings[0]]);
  });

  it('strips only a colliding shift variant', () => {
    const shift = (): boolean => false;
    expect(withoutReservedKeys([{ key: 'Mod-z', run, shift }], true)).toEqual([]);
    const [kept] = withoutReservedKeys([{ key: 'Mod-p', run, shift }], false);
    expect(kept?.shift).toBeUndefined();
    expect(kept?.key).toBe('Mod-p');
    const [untouched] = withoutReservedKeys([{ key: 'Mod-j', run, shift }], false);
    expect(untouched?.shift).toBe(shift);
  });
});

describe('detectMac', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects macOS from the user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' });
    expect(detectMac()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    expect(detectMac()).toBe(false);
    vi.stubGlobal('navigator', undefined);
    expect(detectMac()).toBe(false);
  });

  it('is used as the default platform', () => {
    vi.stubGlobal('navigator', { userAgent: 'Linux' });
    expect(withoutReservedKeys([{ key: 'Ctrl-b', run }])).toEqual([]);
  });
});
