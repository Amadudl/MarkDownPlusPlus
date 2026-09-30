import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, applySettingsPatch } from '@shared/settings';
import { resolveTheme, themeRootAttributes, themeToCssVariables } from './engine';
import { buildExportCss, cssVariablesBlock, escapeCssForStyleElement } from './export-css';

// Vitest (css: false) empties `?raw` CSS imports; load the real stylesheets instead.
vi.mock('./css/tokens.css?raw', async () => (await import('./testing/raw-css')).rawCssModule('tokens.css'));
vi.mock('./css/elements.css?raw', async () =>
  (await import('./testing/raw-css')).rawCssModule('elements.css'),
);
vi.mock('./css/export.css?raw', async () => (await import('./testing/raw-css')).rawCssModule('export.css'));
vi.mock('./css/tokens-classes.css?raw', async () =>
  (await import('./testing/raw-css')).rawCssModule('tokens-classes.css'),
);

describe('buildExportCss', () => {
  const theme = resolveTheme(
    applySettingsPatch(DEFAULT_SETTINGS, { rendering: { codeTheme: 'monokai', elementStyle: 'technical' } }),
    false,
  );
  const { css, rootAttributes } = buildExportCss(theme);

  it('inlines every theme variable into :root', () => {
    const block = css.slice(css.indexOf('/* Active theme */'));
    for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
      expect(block).toContain(`${name}: ${value};`);
    }
    expect(block).toContain('color-scheme: light;');
  });

  it('places the active theme after the default tokens so it wins', () => {
    const defaults = css.indexOf('/* Default theme');
    const active = css.indexOf('/* Active theme */');
    expect(defaults).toBeGreaterThan(-1);
    expect(active).toBeGreaterThan(defaults);
  });

  it('contains element, token and page styles but no editor chrome or KaTeX', () => {
    expect(css).toContain('.mpp-document');
    expect(css).toContain("[data-mpp-codeblock='window']");
    expect(css).toContain('.tok-keyword');
    expect(css).toContain('.mpp-export');
    expect(css).not.toContain('--crepe-color');
    expect(css).not.toContain('.katex {\n  font-family');
  });

  it('returns the root attributes of the theme', () => {
    expect(rootAttributes).toEqual(themeRootAttributes(theme));
    expect(rootAttributes['data-mpp-codeblock']).toBe('window');
  });

  it('can never terminate the surrounding <style> element', () => {
    expect(css).not.toContain('<');
    const hostile = {
      ...theme,
      elements: { ...theme.elements, typography: { ...theme.elements.typography, bodyFont: '</style>x' } },
    };
    expect(buildExportCss(hostile).css).not.toMatch(/<\/style/i);
  });
});

describe('helpers', () => {
  it('escapes "<" as a CSS escape', () => {
    expect(escapeCssForStyleElement('a</style><!--')).toBe('a\\3c /style>\\3c !--');
  });

  it('serialises a variables block', () => {
    expect(cssVariablesBlock({ '--a': '1', '--b': 'x y' }, 'dark')).toBe(
      ':root {\n  color-scheme: dark;\n  --a: 1;\n  --b: x y;\n}',
    );
  });
});
