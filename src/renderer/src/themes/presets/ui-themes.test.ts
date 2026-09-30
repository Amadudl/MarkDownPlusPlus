import { describe, expect, it } from 'vitest';
import { uiThemeSchema } from '@shared/theme-model';
import { composite, contrastRatio, parseHexColor, toHex } from '../color';
import { BUILTIN_UI_THEMES, DEFAULT_DARK_UI_THEME, DEFAULT_LIGHT_UI_THEME } from './ui-themes';

const REQUIRED_IDS = [
  'midnight',
  'daylight',
  'graphite',
  'paper',
  'sepia',
  'nord',
  'dracula',
  'one-dark',
  'solarized-dark',
  'solarized-light',
  'gruvbox-dark',
  'gruvbox-light',
  'tokyo-night',
  'catppuccin-mocha',
  'catppuccin-latte',
  'rose-pine',
  'monokai',
  'github-dark',
  'github-light',
  'high-contrast-dark',
  'high-contrast-light',
];

/** Text/background pairs that must reach WCAG AA (4.5:1) in every built-in UI theme. */
const AA_PAIRS = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceElevated'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['editorText', 'editorBackground'],
  ['heading', 'editorBackground'],
  ['link', 'editorBackground'],
  ['accentText', 'accent'],
] as const;

describe('built-in UI themes', () => {
  it('contains every required theme exactly once', () => {
    const ids = BUILTIN_UI_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_IDS));
    expect(ids.length).toBeGreaterThanOrEqual(16);
  });

  it('has unique display names', () => {
    const names = BUILTIN_UI_THEMES.map((theme) => theme.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('exposes Midnight and Daylight as the built-in defaults', () => {
    expect(DEFAULT_DARK_UI_THEME).toMatchObject({ id: 'midnight', kind: 'dark' });
    expect(DEFAULT_LIGHT_UI_THEME).toMatchObject({ id: 'daylight', kind: 'light' });
    expect(BUILTIN_UI_THEMES).toContain(DEFAULT_DARK_UI_THEME);
    expect(BUILTIN_UI_THEMES).toContain(DEFAULT_LIGHT_UI_THEME);
  });

  it.each(BUILTIN_UI_THEMES.map((theme) => [theme.id, theme] as const))('%s is valid', (_id, theme) => {
    expect(uiThemeSchema.parse(theme)).toEqual(theme);
  });

  it.each(BUILTIN_UI_THEMES.map((theme) => [theme.id, theme] as const))(
    '%s reaches WCAG AA text contrast',
    (_id, theme) => {
      const failures = AA_PAIRS.filter(
        ([fg, bg]) => contrastRatio(theme.colors[fg], theme.colors[bg]) < 4.5,
      ).map(([fg, bg]) => `${fg}/${bg} = ${contrastRatio(theme.colors[fg], theme.colors[bg]).toFixed(2)}`);
      expect(failures).toEqual([]);
    },
  );

  it.each(BUILTIN_UI_THEMES.map((theme) => [theme.id, theme] as const))(
    '%s keeps inline code readable',
    (_id, theme) => {
      const { inlineCodeText, inlineCodeBackground, editorBackground } = theme.colors;
      // Inline code backgrounds are usually translucent: composite them over the editor surface.
      const background = toHex(
        composite(parseHexColor(inlineCodeBackground), parseHexColor(editorBackground)),
      );
      expect(contrastRatio(inlineCodeText, background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('uses the declared kind consistently with the editor background', () => {
    for (const theme of BUILTIN_UI_THEMES) {
      const vsBlack = contrastRatio(theme.colors.editorBackground, '#000000');
      const vsWhite = contrastRatio(theme.colors.editorBackground, '#ffffff');
      expect(theme.kind === 'dark' ? vsWhite > vsBlack : vsBlack > vsWhite).toBe(true);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(BUILTIN_UI_THEMES)).toBe(true);
  });
});
