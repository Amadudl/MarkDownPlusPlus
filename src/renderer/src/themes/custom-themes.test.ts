import { describe, expect, it } from 'vitest';
import { codeThemeSchema, elementStyleSchema, uiThemeSchema } from '@shared/theme-model';
import {
  createCustomCodeTheme,
  createCustomElementStyle,
  createCustomUiTheme,
  slugify,
  uniqueCustomId,
} from './custom-themes';
import { BUILTIN_CODE_THEMES } from './presets/code-themes';
import { BUILTIN_ELEMENT_STYLES } from './presets/element-styles';
import { BUILTIN_UI_THEMES } from './presets/ui-themes';

const [ui] = BUILTIN_UI_THEMES;
const [code] = BUILTIN_CODE_THEMES;
const [elements] = BUILTIN_ELEMENT_STYLES;

describe('slugify', () => {
  it('produces lowercase kebab-case ASCII', () => {
    expect(slugify('  My  Dark Theme! ')).toBe('my-dark-theme');
    expect(slugify('Rosé Pine — Moon')).toBe('rose-pine-moon');
    expect(slugify('日本語')).toBe('');
  });
});

describe('uniqueCustomId', () => {
  it('prefixes ids with custom-', () => {
    expect(uniqueCustomId('Ocean', [])).toBe('custom-ocean');
  });

  it('appends a counter on collisions', () => {
    expect(uniqueCustomId('Ocean', ['custom-ocean'])).toBe('custom-ocean-2');
    expect(uniqueCustomId('Ocean', ['custom-ocean', 'custom-ocean-2'])).toBe('custom-ocean-3');
  });

  it('uses a generic slug when the name has no ASCII letters', () => {
    expect(uniqueCustomId('✨✨', [])).toBe('custom-theme');
  });

  it('never exceeds 64 characters, even with a counter', () => {
    const long = 'a'.repeat(120);
    const first = uniqueCustomId(long, []);
    expect(first).toHaveLength(64);
    const second = uniqueCustomId(long, [first]);
    expect(second).toHaveLength(64);
    expect(second.endsWith('-2')).toBe(true);
  });

  it('does not leave a dangling hyphen when truncating', () => {
    const name = `${'b'.repeat(56)} cd`;
    expect(uniqueCustomId(name, [])).toBe(`custom-${'b'.repeat(56)}`);
  });
});

describe('createCustom*', () => {
  it('creates a valid, independent copy of a UI theme', () => {
    const copy = createCustomUiTheme(ui!, '  My   Midnight ', ['custom-my-midnight']);
    expect(copy.id).toBe('custom-my-midnight-2');
    expect(copy.name).toBe('My Midnight');
    expect(copy.colors).toEqual(ui!.colors);
    expect(copy.colors).not.toBe(ui!.colors);
    expect(uiThemeSchema.parse(copy)).toEqual(copy);
  });

  it('creates a valid copy of a code theme', () => {
    const copy = createCustomCodeTheme(code!, 'Retro', []);
    expect(copy).toMatchObject({ id: 'custom-retro', name: 'Retro', kind: code!.kind });
    expect(codeThemeSchema.parse(copy)).toEqual(copy);
  });

  it('creates a deep copy of an element style', () => {
    const copy = createCustomElementStyle(elements!, 'Docs', []);
    copy.headings.scale[0] = 9;
    expect(elements!.headings.scale[0]).not.toBe(9);
    expect(elementStyleSchema.parse({ ...copy, headings: elements!.headings })).toBeTruthy();
    expect(copy.id).toBe('custom-docs');
  });

  it('rejects empty and overlong names', () => {
    expect(() => createCustomUiTheme(ui!, '   ', [])).toThrow('Please enter a name for the theme.');
    expect(() => createCustomCodeTheme(code!, 'x'.repeat(65), [])).toThrow(/at most 64/);
  });
});
