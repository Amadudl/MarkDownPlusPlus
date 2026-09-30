import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { resolveTheme, themeRootAttributes } from './engine';
import { ELEMENT_PREVIEW_CSS, elementPreviewScope } from './element-preview';
import { BUILTIN_ELEMENT_STYLES } from './presets/element-styles';
import { readThemeCss } from './testing/raw-css';

// Vitest (css: false) empties `?raw` CSS imports; load the real stylesheets instead.
vi.mock('./css/elements.css?raw', async () =>
  (await import('./testing/raw-css')).rawCssModule('elements.css'),
);
vi.mock('./css/tokens-classes.css?raw', async () =>
  (await import('./testing/raw-css')).rawCssModule('tokens-classes.css'),
);

const theme = resolveTheme(DEFAULT_SETTINGS, false);
const find = (id: string): (typeof BUILTIN_ELEMENT_STYLES)[number] => {
  const style = BUILTIN_ELEMENT_STYLES.find((candidate) => candidate.id === id);
  if (style === undefined) throw new Error(`missing preset ${id}`);
  return style;
};

describe('ELEMENT_PREVIEW_CSS', () => {
  it('contains the element styles and the syntax classes, safe for a <style> element', () => {
    expect(ELEMENT_PREVIEW_CSS).toContain(readThemeCss('elements.css'));
    expect(ELEMENT_PREVIEW_CSS).toContain('.tok-keyword');
    expect(ELEMENT_PREVIEW_CSS).not.toContain('<');
  });
});

describe('elementPreviewScope', () => {
  it('describes the variants of the previewed style, not of the active one', () => {
    const technical = find('technical');
    const scope = elementPreviewScope(theme, technical);
    expect(theme.elements.id).not.toBe('technical');
    expect(scope.attributes).toEqual(themeRootAttributes({ ...theme, elements: technical }));
    expect(scope.attributes).toMatchObject({
      'data-mpp-element-style': 'technical',
      'data-mpp-table': 'grid',
      'data-mpp-codeblock': 'window',
      'data-mpp-theme-kind': theme.ui.kind,
    });
  });

  it('only carries the element variables, so colours inherit from the active theme', () => {
    const classic = find('classic');
    const { variables } = elementPreviewScope(theme, classic);
    expect(Object.keys(variables).every((name) => name.startsWith('--mpp-el-'))).toBe(true);
    expect(variables['--mpp-el-heading-font']).toBe(classic.typography.headingFont);
    expect(variables['--mpp-el-h1-size']).toBe(`${String(classic.headings.scale[0])}em`);
    expect(variables['--mpp-el-heading-color']).toBe('var(--mpp-ui-accent)');
  });
});
