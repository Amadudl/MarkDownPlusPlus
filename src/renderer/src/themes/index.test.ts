import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/settings';
import * as themes from './index';

describe('themes public API', () => {
  it('exposes the documented contract', () => {
    for (const name of [
      'listUiThemes',
      'listCodeThemes',
      'listElementStyles',
      'resolveTheme',
      'themeToCssVariables',
      'themeRootAttributes',
      'applyTheme',
      'buildExportCss',
      'buildExportFontCss',
      'createCustomUiTheme',
      'createCustomCodeTheme',
      'createCustomElementStyle',
      'parseThemeImport',
      'serializeThemeExport',
      'contrastRatio',
    ] as const) {
      expect(typeof themes[name], name).toBe('function');
    }
    expect(themes.BUILTIN_UI_THEMES.length).toBeGreaterThanOrEqual(16);
    expect(themes.BUILTIN_CODE_THEMES.length).toBeGreaterThanOrEqual(26);
    expect(themes.BUILTIN_ELEMENT_STYLES.length).toBeGreaterThanOrEqual(10);
    expect(themes.AUTO_CODE_THEME).toBe('auto');
  });

  it('works end to end: resolve, apply and export', () => {
    const theme = themes.resolveTheme(DEFAULT_SETTINGS, true);
    themes.applyTheme(document.documentElement, theme);
    expect(document.documentElement.getAttribute('data-mpp-theme-kind')).toBe('dark');
    expect(themes.buildExportCss(theme).rootAttributes['data-mpp-ui-theme']).toBe('midnight');
    expect(themes.contrastRatio('#000', '#fff')).toBeCloseTo(21);
  });
});
