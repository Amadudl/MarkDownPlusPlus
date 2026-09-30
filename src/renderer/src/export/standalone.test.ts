import { describe, expect, it, vi } from 'vitest';
import type { ResolvedTheme } from '@renderer/themes';

const themes = vi.hoisted(() => ({
  buildExportCss: vi.fn(() => ({
    css: ':root{--mpp-ui-text:#111111}\n.mpp-document{color:var(--mpp-ui-text)}</style><script>alert(1)</script>',
    rootAttributes: {
      'data-mpp-theme-kind': 'dark',
      'data-mpp-quote': 'card"><script>',
      onload: 'alert(1)',
    },
  })),
  buildExportFontCss: vi.fn(() =>
    Promise.resolve("@font-face { font-family: 'Inter Variable'; src: url(data:font/woff2;base64,AAAA) }"),
  ),
}));

vi.mock('@renderer/themes', () => themes);
vi.mock('./katex-css', () => ({
  getKatexCss: () => Promise.resolve('.katex{font:normal 1.21em KaTeX_Main}'),
}));

const { buildStandaloneHtml, EXPORT_CSP } = await import('./index');

/** Only the parts of the theme the pipeline passes through; the themes module is mocked. */
const theme = { ui: { id: 'midnight' } } as unknown as ResolvedTheme;

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('buildStandaloneHtml', () => {
  it('produces a complete, self-contained document', async () => {
    const html = await buildStandaloneHtml({
      title: 'Guide',
      markdown: '# Hello\n\n$a$',
      documentPath: '/docs/guide.md',
      theme,
      loadRemoteImages: false,
    });
    expect(html.startsWith('<!doctype html>\n<html')).toBe(true);
    expect(html.endsWith('</html>\n')).toBe(true);
    expect(themes.buildExportCss).toHaveBeenCalledWith(theme);

    const doc = parse(html);
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.documentElement.getAttribute('data-mpp-theme-kind')).toBe('dark');
    expect(doc.documentElement.getAttribute('data-mpp-quote')).toBe('card"><script>');
    expect(doc.documentElement.hasAttribute('onload')).toBe(false);
    expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
    expect(doc.querySelector('meta[name="generator"]')?.getAttribute('content')).toBe('MarkDown++');
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(
      EXPORT_CSP,
    );
    expect(doc.title).toBe('Guide');
    expect(doc.querySelectorAll('style')).toHaveLength(1);
    const style = doc.querySelector('style')?.textContent ?? '';
    expect(style).toContain('.mpp-document{color:var(--mpp-ui-text)}');
    expect(style).toContain('.katex{font:normal 1.21em KaTeX_Main}');
    expect(themes.buildExportFontCss).toHaveBeenCalledWith(theme);
    expect(style).toContain(
      "@font-face { font-family: 'Inter Variable'; src: url(data:font/woff2;base64,AAAA) }",
    );
    expect(style.indexOf('.mpp-document{')).toBeLessThan(style.indexOf('@font-face'));
    expect(doc.querySelector('script')).toBeNull();
    const article = doc.querySelector('body > article.mpp-document.mpp-export');
    expect(article?.querySelector('h1#hello')?.textContent).toBe('Hello');
    expect(article?.querySelector('.katex')).not.toBeNull();
  });

  it('escapes the title and falls back for blank titles', async () => {
    const base = { markdown: 'x', documentPath: null, theme, loadRemoteImages: true };
    const hostile = await buildStandaloneHtml({ ...base, title: '  </title><script>alert(1)</script>  ' });
    expect(hostile).toContain('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(parse(hostile).querySelector('script')).toBeNull();
    const blank = await buildStandaloneHtml({ ...base, title: '   ' });
    expect(parse(blank).title).toBe('Untitled');
  });

  it('keeps front matter out of the body and uses its title only for blank titles', async () => {
    const base = { documentPath: null, theme, loadRemoteImages: true };
    const markdown = '---\ntitle: "</title><script>x</script>"\n---\nBody';
    const fromFrontMatter = parse(await buildStandaloneHtml({ ...base, title: ' ', markdown }));
    expect(fromFrontMatter.title).toBe('</title><script>x</script>');
    expect(fromFrontMatter.querySelector('script')).toBeNull();
    expect(fromFrontMatter.querySelector('article')?.textContent.trim()).toBe('Body');
    expect(fromFrontMatter.querySelector('article hr')).toBeNull();

    const given = parse(await buildStandaloneHtml({ ...base, title: 'guide', markdown }));
    expect(given.title).toBe('guide');

    const untitled = parse(
      await buildStandaloneHtml({ ...base, title: '', markdown: '---\ndate: 1\n---\n' }),
    );
    expect(untitled.title).toBe('Untitled');
    const plain = parse(await buildStandaloneHtml({ ...base, title: '', markdown: 'title: x' }));
    expect(plain.title).toBe('Untitled');
  });

  it('still exports, with fallback fonts, when the bundled fonts cannot be embedded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    themes.buildExportFontCss.mockRejectedValueOnce(new Error('chunk missing'));
    const html = await buildStandaloneHtml({
      title: 'Doc',
      markdown: 'Body',
      documentPath: null,
      theme,
      loadRemoteImages: false,
    });
    expect(parse(html).querySelector('article p')?.textContent).toBe('Body');
    expect(html).not.toContain('@font-face');
    expect(warn).toHaveBeenCalledWith('Export: bundled fonts could not be embedded.', expect.any(Error));
    warn.mockRestore();
  });

  it('declares a CSP without scripts or network access other than images', () => {
    expect(EXPORT_CSP).toContain("default-src 'none'");
    expect(EXPORT_CSP).not.toContain('script-src');
    expect(EXPORT_CSP).toContain('img-src data: https:;');
    expect(EXPORT_CSP).not.toContain('mpp-file');
    expect(EXPORT_CSP).toContain('font-src data:');
    expect(EXPORT_CSP).toContain("base-uri 'none'");
    expect(EXPORT_CSP).toContain("form-action 'none'");
  });
});
