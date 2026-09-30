import katexCss from 'katex/dist/katex.min.css?raw';

/** Lazily imports one KaTeX font as a `data:` URI (Vite `?inline`). */
export type FontLoader = () => Promise<{ default: string }>;

/**
 * Every woff2 font referenced by `katex.min.css`. The fonts are imported lazily so
 * they only enter memory when a document is exported. Chromium (the only consumer
 * of exported HTML/PDF inside the app) supports woff2, so the woff/ttf fallbacks are
 * dropped.
 */
export const KATEX_FONT_LOADERS: Readonly<Record<string, FontLoader>> = {
  'KaTeX_AMS-Regular.woff2': () => import('katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline'),
  'KaTeX_Caligraphic-Bold.woff2': () => import('katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline'),
  'KaTeX_Caligraphic-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline'),
  'KaTeX_Fraktur-Bold.woff2': () => import('katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline'),
  'KaTeX_Fraktur-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline'),
  'KaTeX_Main-Bold.woff2': () => import('katex/dist/fonts/KaTeX_Main-Bold.woff2?inline'),
  'KaTeX_Main-BoldItalic.woff2': () => import('katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline'),
  'KaTeX_Main-Italic.woff2': () => import('katex/dist/fonts/KaTeX_Main-Italic.woff2?inline'),
  'KaTeX_Main-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Main-Regular.woff2?inline'),
  'KaTeX_Math-BoldItalic.woff2': () => import('katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline'),
  'KaTeX_Math-Italic.woff2': () => import('katex/dist/fonts/KaTeX_Math-Italic.woff2?inline'),
  'KaTeX_SansSerif-Bold.woff2': () => import('katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline'),
  'KaTeX_SansSerif-Italic.woff2': () => import('katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline'),
  'KaTeX_SansSerif-Regular.woff2': () => import('katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline'),
  'KaTeX_Script-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Script-Regular.woff2?inline'),
  'KaTeX_Size1-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline'),
  'KaTeX_Size2-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline'),
  'KaTeX_Size3-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline'),
  'KaTeX_Size4-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline'),
  'KaTeX_Typewriter-Regular.woff2': () => import('katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline'),
};

const FONT_DATA_URI =
  /^data:(?:font\/woff2|application\/font-woff2|application\/octet-stream);base64,([A-Za-z0-9+/]+={0,2})$/;
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
const WOFF2_URL = /url\(\s*["']?fonts\/([\w-]+\.woff2)["']?\s*\)/;
const SRC_DESCRIPTOR = /src\s*:[^;}]*/;

/** Normalises a font `data:` URI to `data:font/woff2;base64,...`; null when it is not a base64 font URI. */
export function normalizeFontDataUri(uri: string): string | null {
  const match = FONT_DATA_URI.exec(uri);
  return match?.[1] === undefined ? null : `data:font/woff2;base64,${match[1]}`;
}

/**
 * Rewrites every `@font-face` rule of the KaTeX stylesheet so its `src` is the inlined
 * woff2 data URI from `fonts` (keyed by file name). Rules whose font is not available
 * are removed; the browser then falls back to the next font of KaTeX's font stacks.
 */
export function inlineKatexFonts(css: string, fonts: ReadonlyMap<string, string>): string {
  return css.replace(FONT_FACE, (rule) => {
    const file = WOFF2_URL.exec(rule)?.[1];
    const uri = file === undefined ? undefined : fonts.get(file);
    return uri === undefined ? '' : rule.replace(SRC_DESCRIPTOR, `src:url(${uri}) format("woff2")`);
  });
}

/** Loads every font of `loaders` (in parallel); fonts that fail to load or validate are skipped. */
export async function loadFontDataUris(
  loaders: Readonly<Record<string, FontLoader>>,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    Object.entries(loaders).map(async ([file, load]) => {
      try {
        const uri = normalizeFontDataUri((await load()).default);
        return uri === null ? null : ([file, uri] as const);
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

let cached: Promise<string> | null = null;

/**
 * The complete KaTeX stylesheet with all fonts inlined as data URIs, so math renders
 * correctly in exported files under the strict `font-src data:` CSP. Computed once.
 */
export function getKatexCss(): Promise<string> {
  cached ??= loadFontDataUris(KATEX_FONT_LOADERS).then((fonts) => inlineKatexFonts(katexCss, fonts));
  return cached;
}
