import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from './render';

const DOC = '/Users/me/notes/guide.md';

async function render(
  markdown: string,
  loadRemoteImages = true,
  documentPath: string | null = DOC,
): Promise<HTMLElement> {
  const container = document.createElement('article');
  container.innerHTML = await renderMarkdownToHtml(markdown, { documentPath, loadRemoteImages });
  return container;
}

const RICH = `# Getting *Started*

Some **bold**, _italic_, ~~struck~~ and \`inline code\` text with an autolink https://example.com/page.

## Getting Started

| Name | Value |
| :--- | ----: |
| a    | 1     |

- [x] shipped
- [ ] pending
- plain item

1. first
2. second

> A quote

---

\`\`\`ts
const answer: number = 42;
\`\`\`

\`\`\`python
def greet(name):
    return "hi " + name
\`\`\`

\`\`\`definitely-unknown
<b>not bold</b>
\`\`\`

\`\`\`
no language
\`\`\`

Euler: $e^{i\\pi} + 1 = 0$

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

A note.[^note]

[^note]: The footnote text.
`;

describe('renderMarkdownToHtml', () => {
  it('renders headings with unique anchor ids', async () => {
    const root = await render(RICH);
    const headings = [...root.querySelectorAll('h1, h2')].map((h) => [h.tagName, h.id, h.textContent]);
    expect(headings).toEqual([
      ['H1', 'getting-started', 'Getting Started'],
      ['H2', 'getting-started-1', 'Getting Started'],
      ['H2', 'footnote-label', 'Footnotes'],
    ]);
    expect(root.querySelector('h1 em')?.textContent).toBe('Started');
  });

  it('renders inline formatting, autolinks and rules', async () => {
    const root = await render(RICH);
    expect(root.querySelector('strong')?.textContent).toBe('bold');
    expect(root.querySelector('p em')?.textContent).toBe('italic');
    expect(root.querySelector('del')?.textContent).toBe('struck');
    expect(root.querySelector('p > code')?.textContent).toBe('inline code');
    const autolink = root.querySelector('a[href="https://example.com/page"]');
    expect(autolink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.querySelector('hr')).not.toBeNull();
    expect(root.querySelector('blockquote p')?.textContent).toBe('A quote');
    expect(root.querySelectorAll(':scope > ol > li')).toHaveLength(2);
  });

  it('wraps GFM tables and keeps alignment', async () => {
    const root = await render(RICH);
    const table = root.querySelector('div.mpp-table-wrap > table');
    expect(table).not.toBeNull();
    expect(table?.querySelector('th')?.getAttribute('align')).toBe('left');
    expect(table?.querySelectorAll('td')[1]?.getAttribute('align')).toBe('right');
  });

  it('renders task lists with disabled checkboxes', async () => {
    const root = await render(RICH);
    const items = root.querySelectorAll('li.task-list-item');
    expect(items).toHaveLength(2);
    const boxes = [...root.querySelectorAll('input')];
    expect(boxes.map((box) => [box.type, box.disabled, box.checked])).toEqual([
      ['checkbox', true, true],
      ['checkbox', true, false],
    ]);
  });

  it('highlights known languages and escapes unknown ones', async () => {
    const root = await render(RICH);
    const figures = [...root.querySelectorAll('figure.mpp-code-block')];
    expect(figures.map((figure) => figure.getAttribute('data-language'))).toEqual([
      'ts',
      'python',
      'definitely-unknown',
      null,
    ]);
    const [ts, python, unknown, plain] = figures;
    expect(ts?.querySelector('figcaption.mpp-code-lang')?.textContent).toBe('ts');
    expect(ts?.querySelector('pre > code.language-ts .tok-keyword')?.textContent).toBe('const');
    expect(ts?.querySelector('.tok-number')?.textContent).toBe('42');
    expect(python?.querySelector('.tok-keyword')?.textContent).toBe('def');
    expect(python?.querySelector('.tok-string')).not.toBeNull();
    expect(python?.querySelector('.tok-function')?.textContent).toBe('greet');
    const pythonLines = [...(python?.querySelectorAll('code > .mpp-code-line') ?? [])];
    expect(pythonLines.map((line) => line.textContent)).toEqual([
      'def greet(name):',
      '    return "hi " + name',
    ]);
    expect(python?.querySelector('code')?.textContent).toBe('def greet(name):\n    return "hi " + name');
    expect(unknown?.querySelector('b')).toBeNull();
    expect(unknown?.querySelector('code')?.textContent).toBe('<b>not bold</b>');
    expect(plain?.querySelector('figcaption')).toBeNull();
    expect(plain?.querySelector('code')?.textContent).toBe('no language');
  });

  it('renders inline and display math with KaTeX', async () => {
    const root = await render(RICH);
    const katex = root.querySelectorAll('.katex');
    expect(katex).toHaveLength(2);
    expect(root.querySelector('.katex-display .katex')).not.toBeNull();
    expect(root.querySelector('annotation')?.textContent).toBe('e^{i\\pi} + 1 = 0');
    expect(root.querySelector('.katex-html [style]')).not.toBeNull();
  });

  it('renders invalid math as an error instead of throwing', async () => {
    const root = await render('$\\frac{$ and $\\undefinedmacro$');
    expect(root.textContent).toContain('\\undefinedmacro');
    expect(root.querySelector('script')).toBeNull();
  });

  it('renders footnotes with working back references', async () => {
    const root = await render(RICH);
    const ref = root.querySelector('sup a[data-footnote-ref]');
    const target = ref?.getAttribute('href')?.slice(1) ?? '';
    expect(root.querySelector(`[id="${target}"]`)?.textContent).toContain('The footnote text.');
    expect(root.querySelector('section.footnotes a[data-footnote-backref]')).not.toBeNull();
  });

  it('resolves images and blocks unsafe or disallowed ones', async () => {
    const md =
      '![rel](img/a.png) ![abs](/tmp/b.png) ![win](C:\\pics\\c.png) ![remote](https://example.com/d.png) ' +
      '![js](javascript:alert(1)) ![data](data:image/png;base64,iVBORw0KGgo=)';
    const root = await render(md, false);
    expect([...root.querySelectorAll('img')].map((img) => [img.alt, img.getAttribute('src')])).toEqual([
      ['rel', 'mpp-file://local/%2FUsers%2Fme%2Fnotes%2Fimg%2Fa.png'],
      ['abs', 'mpp-file://local/%2Ftmp%2Fb.png'],
      ['win', 'mpp-file://local/C%3A%2Fpics%2Fc.png'],
      ['data', 'data:image/png;base64,iVBORw0KGgo='],
    ]);
    expect([...root.querySelectorAll('.mpp-image-blocked')].map((span) => span.textContent)).toEqual([
      'remote',
      'js',
    ]);
    expect(root.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    const remote = await render('![remote](https://example.com/d.png)', true);
    expect(remote.querySelector('img')?.getAttribute('src')).toBe('https://example.com/d.png');
    const unsaved = await render('![rel](a.png)', true, null);
    expect(unsaved.querySelector('img')).toBeNull();
  });

  it('keeps only safe links', async () => {
    const root = await render(
      '[js](javascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) [mail](mailto:me@example.com) ' +
        '[anchor](#getting-started) [file](other.md) [web](http://example.com)',
    );
    expect([...root.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['mail', 'mailto:me@example.com'],
      ['anchor', '#getting-started'],
      ['web', 'http://example.com'],
    ]);
    expect(root.textContent).toContain('js data mail anchor file web');
  });

  it('never renders raw HTML from the markdown', async () => {
    const md =
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\ntext <b onclick="x()">inline</b> ' +
      '<iframe src="https://evil"></iframe>\n\n<style>body{display:none}</style>\n\n' +
      '<a href="javascript:alert(1)">raw link</a>';
    const root = await render(md);
    expect(root.querySelector('script, img, iframe, style, b, a, [onerror], [onclick]')).toBeNull();
    expect(root.innerHTML).not.toContain('alert');
    expect(root.textContent).toContain('inline');
  });

  it('suffixes heading ids that would clobber DOM properties', async () => {
    const root = await render('# Location\n\n# Cookie');
    expect([...root.querySelectorAll('h1')].map((h) => h.id)).toEqual(['location-1', 'cookie-1']);
  });

  describe('front matter', () => {
    it('does not render YAML front matter as a rule and a setext heading', async () => {
      const root = await render('---\ntitle: Guide\ntags: [a, b]\n---\n\n# Intro\n\nText');
      expect(root.querySelector('hr, h2')).toBeNull();
      expect(root.textContent).not.toContain('Guide');
      expect(root.querySelector('h1')?.textContent).toBe('Intro');
    });

    it('does not render TOML front matter with CRLF line endings', async () => {
      const root = await render('+++\r\ntitle = "Guide"\r\n+++\r\nText');
      expect(root.textContent).not.toContain('Guide');
      expect(root.textContent).not.toContain('+++');
      expect(root.querySelector('p')?.textContent).toBe('Text');
    });

    it('renders an unclosed or non-leading block as ordinary markdown', async () => {
      const unclosed = await render('---\ntitle: Guide\n');
      expect(unclosed.querySelector('hr')).not.toBeNull();
      expect(unclosed.textContent).toContain('title: Guide');
      const later = await render('Intro\n\n---\ntitle: Guide\n---\n');
      expect(later.querySelector('hr')).not.toBeNull();
      expect(later.querySelector('h2')?.textContent).toBe('title: Guide');
    });

    it('renders nothing for a document that is only empty front matter', async () => {
      await expect(
        renderMarkdownToHtml('---\n---\n', { documentPath: null, loadRemoteImages: false }),
      ).resolves.toBe('');
    });
  });

  it('returns an empty string for an empty document', async () => {
    await expect(renderMarkdownToHtml('', { documentPath: null, loadRemoteImages: false })).resolves.toBe('');
  });

  it('uses a custom parser resolver when given', async () => {
    const html = await renderMarkdownToHtml('```ts\nconst a = 1;\n```', {
      documentPath: null,
      loadRemoteImages: false,
      resolveParser: () => Promise.resolve(null),
    });
    expect(html).toBe(
      '<figure class="mpp-code-block" data-language="ts"><figcaption class="mpp-code-lang">ts</figcaption>' +
        '<pre><code class="language-ts"><span class="mpp-code-line">const a = 1;</span></code></pre></figure>',
    );
  });
});
