import type { ResolvedTheme } from '@renderer/themes';
import { buildExportCss, buildExportFontCss } from '@renderer/themes';
import { escapeHtml, escapeStyleContent, serializeAttributes } from './html';
import { frontMatterTitle, splitExportFrontMatter } from './front-matter';
import { getKatexCss } from './katex-css';
import { renderMarkdownToHtml } from './render';

/** Everything needed to export one document. */
export interface ExportInput {
  /**
   * Document title (usually the file name); used for `<title>`. When it is blank, the
   * `title` entry of the document's front matter is used, then {@link UNTITLED}.
   */
  readonly title: string;
  readonly markdown: string;
  /** Absolute path of the document, used to resolve relative image paths. */
  readonly documentPath: string | null;
  readonly theme: ResolvedTheme;
  /** Whether `http(s):` images are kept. */
  readonly loadRemoteImages: boolean;
}

/**
 * Content Security Policy of exported files: no scripts, no network access except
 * images (`https:` and embedded `data:`), inline styles only, inlined fonts only,
 * and no `<base>` or form submission targets. The app-internal `mpp-file:` scheme is
 * deliberately absent: the main process embeds every local image as a `data:` URI
 * (or blanks it) before the file is written or printed, and the scheme means nothing
 * outside MarkDown++.
 */
export const EXPORT_CSP =
  "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; " +
  "base-uri 'none'; form-action 'none'";

/** Title used when the given one is blank and the front matter declares none. */
export const UNTITLED = 'Untitled';

/**
 * `@font-face` rules embedding the bundled fonts the theme uses. Font embedding is a
 * visual nicety: when a font cannot be loaded the export still succeeds and the
 * browser falls back to the next family of the theme's font stacks.
 */
async function exportFontCss(theme: ResolvedTheme): Promise<string> {
  try {
    return await buildExportFontCss(theme);
  } catch (error) {
    console.warn('Export: bundled fonts could not be embedded.', error);
    return '';
  }
}

/**
 * The `<title>` of an export: the given title, else the front matter's `title` entry,
 * else {@link UNTITLED}.
 */
function documentTitle(input: ExportInput): string {
  const given = input.title.trim();
  if (given !== '') return given;
  const { frontMatter } = splitExportFrontMatter(input.markdown);
  return (frontMatter === null ? null : frontMatterTitle(frontMatter)) ?? UNTITLED;
}

/**
 * Builds a complete, self-contained `<!doctype html>` document: theme CSS (with all
 * variables resolved), the theme's bundled fonts (Inter / JetBrains Mono) and KaTeX
 * CSS inlined as `data:` fonts, a strict CSP and the sanitised
 * markdown inside `<article class="mpp-document mpp-export">`. Used for HTML export
 * and as the source of PDF export. Front matter is never rendered as content; its
 * `title` entry only fills in `<title>` when `input.title` is blank.
 */
export async function buildStandaloneHtml(input: ExportInput): Promise<string> {
  const [body, katexCss, fontCss] = await Promise.all([
    renderMarkdownToHtml(input.markdown, {
      documentPath: input.documentPath,
      loadRemoteImages: input.loadRemoteImages,
    }),
    getKatexCss(),
    exportFontCss(input.theme),
  ]);
  const { css, rootAttributes } = buildExportCss(input.theme);
  const title = documentTitle(input);
  return [
    '<!doctype html>',
    `<html${serializeAttributes({ ...rootAttributes, lang: 'en' })}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="MarkDown++">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(EXPORT_CSP)}">`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>\n${[css, fontCss, katexCss].map(escapeStyleContent).join('\n')}\n</style>`,
    '</head>',
    '<body>',
    `<article class="mpp-document mpp-export">\n${body}\n</article>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
