import { describe, expect, it } from 'vitest';
import { AUTO_CODE_THEME_BY_KIND, AUTO_CODE_THEME_PAIRING, autoCodeThemeId } from './code-pairing';
import { BUILTIN_CODE_THEMES } from './code-themes';
import { BUILTIN_UI_THEMES } from './ui-themes';

const codeById = new Map(BUILTIN_CODE_THEMES.map((theme) => [theme.id, theme]));

describe('auto code theme pairing', () => {
  it('pairs every built-in UI theme', () => {
    for (const ui of BUILTIN_UI_THEMES) expect(AUTO_CODE_THEME_PAIRING.has(ui.id)).toBe(true);
    expect(AUTO_CODE_THEME_PAIRING.size).toBe(BUILTIN_UI_THEMES.length);
  });

  it('only references existing code themes of the same kind', () => {
    for (const ui of BUILTIN_UI_THEMES) {
      const code = codeById.get(autoCodeThemeId(ui.id, ui.kind));
      expect(code, ui.id).toBeDefined();
      expect(code?.kind, ui.id).toBe(ui.kind);
    }
  });

  it('pairs theme families with their own palette', () => {
    expect(autoCodeThemeId('dracula', 'dark')).toBe('dracula');
    expect(autoCodeThemeId('one-dark', 'dark')).toBe('one-dark-pro');
    expect(autoCodeThemeId('high-contrast-dark', 'dark')).toBe('high-contrast');
  });

  it('falls back by kind for custom or unknown UI themes', () => {
    expect(autoCodeThemeId('custom-mine', 'dark')).toBe(AUTO_CODE_THEME_BY_KIND.dark);
    expect(autoCodeThemeId('custom-mine', 'light')).toBe(AUTO_CODE_THEME_BY_KIND.light);
    expect(autoCodeThemeId('constructor', 'light')).toBe(AUTO_CODE_THEME_BY_KIND.light);
    expect(codeById.get(AUTO_CODE_THEME_BY_KIND.dark)?.kind).toBe('dark');
    expect(codeById.get(AUTO_CODE_THEME_BY_KIND.light)?.kind).toBe('light');
  });
});
