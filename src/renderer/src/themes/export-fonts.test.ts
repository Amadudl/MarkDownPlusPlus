import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, applySettingsPatch } from '@shared/settings';
import { resolveTheme, type ResolvedTheme } from './engine';
import { EXPORT_FONT_SOURCES, buildExportFontCss, type FontDataLoader } from './export-fonts';

const WOFF2 = 'data:font/woff2;base64,d09GMgABAAAAAA==';
const loader =
  (uri: string): FontDataLoader =>
  () =>
    Promise.resolve({ default: uri });

function themeWithFonts(body: string, heading: string, mono: string): ResolvedTheme {
  const base = resolveTheme(DEFAULT_SETTINGS, true);
  return {
    ...base,
    elements: {
      ...base.elements,
      typography: { ...base.elements.typography, bodyFont: body, headingFont: heading, monoFont: mono },
    },
  };
}

describe('buildExportFontCss', () => {
  it('declares one @font-face per used bundled font', async () => {
    const sources = [
      { family: 'Inter Variable', style: 'normal' as const, load: loader(WOFF2) },
      { family: 'JetBrains Mono Variable', style: 'italic' as const, load: loader(WOFF2) },
    ];
    const css = await buildExportFontCss(resolveTheme(DEFAULT_SETTINGS, true), sources);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("font-family: 'Inter Variable';");
    expect(css).toContain('font-style: italic;');
    expect(css).toContain(`src: url(${WOFF2}) format('woff2-variations');`);
  });

  it('skips fonts the theme does not use', async () => {
    const load = (): Promise<{ default: string }> => Promise.reject(new Error('must not load'));
    const theme = themeWithFonts('Georgia, serif', 'Georgia, serif', 'Menlo, monospace');
    const css = await buildExportFontCss(theme, [{ family: 'Inter Variable', style: 'normal', load }]);
    expect(css).toBe('');
  });

  it('ignores loaders that do not return a woff2 data URI', async () => {
    const css = await buildExportFontCss(resolveTheme(DEFAULT_SETTINGS, true), [
      { family: 'Inter Variable', style: 'normal', load: loader('https://evil.example/font.woff2') },
      { family: 'Inter Variable', style: 'normal', load: loader('data:font/woff2;base64,AAA=);}body{x:y') },
    ]);
    expect(css).toBe('');
  });

  it('loads the real bundled fonts as data URIs', async () => {
    const theme = resolveTheme(
      applySettingsPatch(DEFAULT_SETTINGS, { rendering: { elementStyle: 'modern' } }),
      true,
    );
    const css = await buildExportFontCss(theme);
    expect(EXPORT_FONT_SOURCES).toHaveLength(3);
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(css).toMatch(/url\(data:(font\/woff2|application\/octet-stream);base64,/);
  });
});
