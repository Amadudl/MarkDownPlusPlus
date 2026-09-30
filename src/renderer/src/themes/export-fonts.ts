import type { ResolvedTheme } from './engine';
import { BUNDLED_FONTS } from './fonts';

/** Lazily imports a font file as a `data:` URI (Vite `?inline`). */
export type FontDataLoader = () => Promise<{ default: string }>;

interface FontFaceSource {
  readonly family: string;
  readonly style: 'normal' | 'italic';
  readonly load: FontDataLoader;
}

/**
 * Latin subsets of the bundled variable fonts. They are only loaded when a
 * document is exported, so they never weigh on start-up.
 */
export const EXPORT_FONT_SOURCES: readonly FontFaceSource[] = [
  {
    family: BUNDLED_FONTS.ui,
    style: 'normal',
    load: () => import('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'),
  },
  {
    family: BUNDLED_FONTS.mono,
    style: 'normal',
    load: () =>
      import('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline'),
  },
  {
    family: BUNDLED_FONTS.mono,
    style: 'italic',
    load: () =>
      import('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2?inline'),
  },
];

const WOFF2_DATA_URI =
  /^data:(?:font\/woff2|application\/font-woff2|application\/octet-stream);base64,[A-Za-z0-9+/]+={0,2}$/;

/** True when the theme's typography references the given font family. */
function usesFamily(theme: ResolvedTheme, family: string): boolean {
  const { bodyFont, headingFont, monoFont } = theme.elements.typography;
  return [bodyFont, headingFont, monoFont].some((stack) => stack.includes(family));
}

/**
 * Builds `@font-face` rules with the bundled fonts inlined as `data:` URIs, for
 * the fonts the theme actually uses, so exported documents render with the same
 * typography as the editor on machines without these fonts. Append the result to
 * the export stylesheet. Loaders that do not yield a woff2 `data:` URI are skipped.
 */
export async function buildExportFontCss(
  theme: ResolvedTheme,
  sources: readonly FontFaceSource[] = EXPORT_FONT_SOURCES,
): Promise<string> {
  const wanted = sources.filter((source) => usesFamily(theme, source.family));
  const faces = await Promise.all(
    wanted.map(async (source) => {
      const { default: uri } = await source.load();
      if (!WOFF2_DATA_URI.test(uri)) return null;
      return [
        '@font-face {',
        `  font-family: '${source.family}';`,
        `  font-style: ${source.style};`,
        '  font-display: swap;',
        '  font-weight: 100 900;',
        `  src: url(${uri}) format('woff2-variations');`,
        '}',
      ].join('\n');
    }),
  );
  return faces.filter((face) => face !== null).join('\n');
}
