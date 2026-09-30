import { readFileSync } from 'node:fs';

/** Directory of the theme stylesheets, relative to the repository root (Vitest's working directory). */
export const THEME_CSS_DIR = 'src/renderer/src/themes/css';

/**
 * Test-only helper: reads a text file of the repository (relative to its root, which
 * is Vitest's working directory). Paths must stay inside the repository.
 */
export function readRepoFile(relativePath: string): string {
  if (relativePath.startsWith('/') || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`Path must be relative to the repository root: ${relativePath}`);
  }
  return readFileSync(relativePath, 'utf8');
}

/** Reads one of the theme stylesheets in `themes/css`. */
export function readThemeCss(fileName: string): string {
  if (!/^[a-z-]+\.css$/.test(fileName)) throw new Error(`Unexpected stylesheet name: ${fileName}`);
  return readRepoFile(`${THEME_CSS_DIR}/${fileName}`);
}

/**
 * A `?raw` module object for a theme stylesheet. Vitest runs with `css: false`, which
 * turns `?raw` CSS imports into empty strings, so tests mock those imports with
 * `vi.mock('./css/x.css?raw', async () => (await import('./testing/raw-css')).rawCssModule('x.css'))`.
 */
export function rawCssModule(fileName: string): { default: string } {
  return { default: readThemeCss(fileName) };
}
