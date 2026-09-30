import type { ThemeKind } from '@shared/theme-model';

/**
 * Code theme used for each built-in UI theme when the code theme setting is `'auto'`.
 * Families are paired with their own syntax palette; neutral schemes get the
 * code theme whose surface tone blends best with the editor background.
 */
export const AUTO_CODE_THEME_PAIRING: ReadonlyMap<string, string> = new Map(
  Object.entries({
    midnight: 'tokyo-night',
    daylight: 'github-light',
    graphite: 'vscode-dark-modern',
    paper: 'one-light',
    sepia: 'solarized-light',
    nord: 'nord',
    dracula: 'dracula',
    'one-dark': 'one-dark-pro',
    'solarized-dark': 'solarized-dark',
    'solarized-light': 'solarized-light',
    'gruvbox-dark': 'gruvbox-dark',
    'gruvbox-light': 'gruvbox-light',
    'tokyo-night': 'tokyo-night',
    'catppuccin-mocha': 'catppuccin-mocha',
    'catppuccin-latte': 'catppuccin-latte',
    'rose-pine': 'rose-pine',
    monokai: 'monokai',
    'github-dark': 'github-dark',
    'github-light': 'github-light',
    'high-contrast-dark': 'high-contrast',
    'high-contrast-light': 'visual-studio-classic',
  }),
);

/** Code theme used for `'auto'` with custom (or unknown) UI themes, by UI theme kind. */
export const AUTO_CODE_THEME_BY_KIND: Readonly<Record<ThemeKind, string>> = Object.freeze({
  dark: 'one-dark-pro',
  light: 'github-light',
});

/** Returns the id of the code theme that pairs with the given UI theme. */
export function autoCodeThemeId(uiThemeId: string, kind: ThemeKind): string {
  return AUTO_CODE_THEME_PAIRING.get(uiThemeId) ?? AUTO_CODE_THEME_BY_KIND[kind];
}
