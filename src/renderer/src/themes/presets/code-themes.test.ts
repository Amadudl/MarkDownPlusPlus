import { describe, expect, it } from 'vitest';
import { codeThemeColorsSchema, codeThemeSchema } from '@shared/theme-model';
import { contrastRatio } from '../color';
import { BUILTIN_CODE_THEMES, DEFAULT_CODE_THEME_BY_KIND } from './code-themes';

const REQUIRED_IDS = [
  'vscode-dark-modern',
  'vscode-light-modern',
  'visual-studio-classic',
  'monokai',
  'monokai-pro',
  'dracula',
  'one-dark-pro',
  'one-light',
  'solarized-dark',
  'solarized-light',
  'github-light',
  'github-dark',
  'nord',
  'gruvbox-dark',
  'gruvbox-light',
  'intellij-darcula',
  'intellij-light',
  'xcode-light',
  'xcode-dark',
  'eclipse-classic',
  'notepad-plus-plus',
  'sublime-mariana',
  'tokyo-night',
  'catppuccin-mocha',
  'catppuccin-latte',
  'night-owl',
  'material-palenight',
  'ayu-light',
  'ayu-mirage',
  'cobalt2',
  'rose-pine',
  'zenburn',
  'tomorrow-night',
  'high-contrast',
];

const SYNTAX_KEYS = Object.keys(codeThemeColorsSchema.shape).filter(
  (key) =>
    ![
      'background',
      'gutterBackground',
      'gutterForeground',
      'lineHighlight',
      'selection',
      'cursor',
      'border',
    ].includes(key),
) as (keyof typeof codeThemeColorsSchema.shape)[];

const entries = BUILTIN_CODE_THEMES.map((theme) => [theme.id, theme] as const);

describe('built-in code themes', () => {
  it('contains every required theme exactly once', () => {
    const ids = BUILTIN_CODE_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_IDS));
    expect(ids.length).toBeGreaterThanOrEqual(26);
  });

  it('has unique names and a description for every theme', () => {
    const names = BUILTIN_CODE_THEMES.map((theme) => theme.name);
    expect(new Set(names).size).toBe(names.length);
    for (const theme of BUILTIN_CODE_THEMES) expect(theme.description.length).toBeGreaterThan(10);
  });

  it.each(entries)('%s is valid', (_id, theme) => {
    expect(codeThemeSchema.parse(theme)).toEqual(theme);
  });

  it.each(entries)('%s has readable plain text (WCAG AA)', (_id, theme) => {
    expect(contrastRatio(theme.colors.foreground, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(entries)('%s never paints a token in the background colour', (_id, theme) => {
    const invisible = SYNTAX_KEYS.filter(
      (key) => contrastRatio(theme.colors[key], theme.colors.background) < 2,
    );
    expect(invisible).toEqual([]);
  });

  it('declares a kind that matches the background luminance', () => {
    for (const theme of BUILTIN_CODE_THEMES) {
      const lighterThanMid =
        contrastRatio(theme.colors.background, '#000') > contrastRatio(theme.colors.background, '#fff');
      expect(lighterThanMid ? 'light' : 'dark').toBe(theme.kind);
    }
  });

  it('provides built-in fallbacks for both kinds', () => {
    expect(DEFAULT_CODE_THEME_BY_KIND.dark.kind).toBe('dark');
    expect(DEFAULT_CODE_THEME_BY_KIND.light.kind).toBe('light');
    expect(BUILTIN_CODE_THEMES).toContain(DEFAULT_CODE_THEME_BY_KIND.dark);
    expect(BUILTIN_CODE_THEMES).toContain(DEFAULT_CODE_THEME_BY_KIND.light);
  });
});
