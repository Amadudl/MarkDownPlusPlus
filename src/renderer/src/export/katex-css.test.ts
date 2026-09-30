import { beforeEach, describe, expect, it, vi } from 'vitest';

const FIXTURE_CSS =
  '@font-face{font-display:block;font-family:KaTeX_AMS;font-style:normal;font-weight:400;' +
  'src:url(fonts/KaTeX_AMS-Regular.woff2) format("woff2"),url(fonts/KaTeX_AMS-Regular.woff) format("woff")}' +
  '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2")}' +
  '@font-face{font-family:Other;src:url(other.ttf)}' +
  '.katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif}';

vi.mock('katex/dist/katex.min.css?raw', () => ({ default: FIXTURE_CSS }));

const FONT = 'data:font/woff2;base64,d09GMgABAAAA';

describe('normalizeFontDataUri', () => {
  it('accepts base64 font data URIs and normalises the media type', async () => {
    const { normalizeFontDataUri } = await import('./katex-css');
    expect(normalizeFontDataUri(FONT)).toBe(FONT);
    expect(normalizeFontDataUri('data:application/octet-stream;base64,AAAA')).toBe(
      'data:font/woff2;base64,AAAA',
    );
    expect(normalizeFontDataUri('data:application/font-woff2;base64,AA==')).toBe(
      'data:font/woff2;base64,AA==',
    );
  });

  it('rejects anything else', async () => {
    const { normalizeFontDataUri } = await import('./katex-css');
    expect(normalizeFontDataUri('/assets/KaTeX_AMS-Regular.woff2')).toBeNull();
    expect(normalizeFontDataUri('data:font/woff2;base64,AA) ; }</style>')).toBeNull();
    expect(normalizeFontDataUri('data:text/html;base64,AAAA')).toBeNull();
  });
});

describe('inlineKatexFonts', () => {
  it('replaces font sources with data URIs and drops unavailable fonts', async () => {
    const { inlineKatexFonts } = await import('./katex-css');
    const css = inlineKatexFonts(FIXTURE_CSS, new Map([['KaTeX_AMS-Regular.woff2', FONT]]));
    expect(css).toBe(
      '@font-face{font-display:block;font-family:KaTeX_AMS;font-style:normal;font-weight:400;' +
        `src:url(${FONT}) format("woff2")}` +
        '.katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif}',
    );
  });
});

describe('loadFontDataUris', () => {
  it('collects valid fonts and skips failing or invalid loaders', async () => {
    const { loadFontDataUris } = await import('./katex-css');
    const fonts = await loadFontDataUris({
      'a.woff2': () => Promise.resolve({ default: FONT }),
      'b.woff2': () => Promise.reject(new Error('missing')),
      'c.woff2': () => Promise.resolve({ default: '/assets/c.woff2' }),
    });
    expect([...fonts]).toEqual([['a.woff2', FONT]]);
  });
});

describe('KATEX_FONT_LOADERS', () => {
  it('inlines every KaTeX woff2 font as a data URI', async () => {
    const { KATEX_FONT_LOADERS, loadFontDataUris } = await import('./katex-css');
    const fonts = await loadFontDataUris(KATEX_FONT_LOADERS);
    expect(fonts.size).toBe(20);
    for (const uri of fonts.values()) expect(uri.startsWith('data:font/woff2;base64,d09GMg')).toBe(true);
  });
});

describe('getKatexCss', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('builds the stylesheet once with inlined fonts', async () => {
    const { getKatexCss } = await import('./katex-css');
    const first = getKatexCss();
    expect(getKatexCss()).toBe(first);
    const css = await first;
    expect(css).toContain('font-family:KaTeX_AMS');
    expect(css).toContain('font-family:KaTeX_Main');
    expect(css).not.toContain('url(fonts/');
    expect(css).not.toContain('Other');
    expect(css.match(/src:url\(data:font\/woff2;base64,/g)).toHaveLength(2);
  });
});
