import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { ALLOWED_URI_REGEXP, isSafeKatexStyle, sanitizeFragment } from './sanitize';

function parse(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = sanitizeFragment(html);
  return container;
}

describe('sanitizeFragment', () => {
  it('removes scripts, event handlers and dangerous elements', () => {
    const html = sanitizeFragment(
      '<p onclick="x()">a</p><script>alert(1)</script><img src="https://a.b/c.png" onerror="alert(1)">' +
        '<iframe src="https://evil"></iframe><form><button>b</button></form><style>*{}</style>' +
        '<object data="x"></object><embed src="x"><link rel="stylesheet" href="https://x"><meta http-equiv="refresh">',
    );
    // Text content of removed containers (here the button label) is kept as inert text.
    expect(html).toBe('<p>a</p><img src="https://a.b/c.png">b');
  });

  it('keeps the markup produced by the export pipeline', () => {
    const fragment =
      '<h1 id="intro">Intro</h1><figure class="mpp-code-block" data-language="ts">' +
      '<figcaption class="mpp-code-lang">ts</figcaption><pre><code class="language-ts">' +
      '<span class="tok-keyword">const</span></code></pre></figure>' +
      '<div class="mpp-table-wrap"><table><thead><tr><th>a</th></tr></thead></table></div>' +
      '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" checked="" disabled=""> x</li></ul>' +
      '<p><img src="mpp-file://local/%2Fa.png" alt="a" loading="lazy"><a href="#fn" data-footnote-ref="" ' +
      'aria-describedby="footnote-label">1</a></p><section data-footnotes="" class="footnotes"></section>';
    expect(sanitizeFragment(fragment)).toBe(fragment);
  });

  it('drops unknown data attributes', () => {
    expect(sanitizeFragment('<p data-x="1" data-language="ts">a</p>')).toBe('<p data-language="ts">a</p>');
  });

  it('restricts href to web, mail and fragment links', () => {
    const root = parse(
      '<a href="javascript:alert(1)">1</a><a href="data:text/html,x">2</a><a href="other.md">3</a>' +
        '<a href="vbscript:x">4</a><a href="https://ok">5</a><a href="mailto:a@b">6</a><a href="#x">7</a>' +
        '<a href="mpp-file://local/%2Fa">8</a><a href=" java\nscript:alert(1)">9</a>',
    );
    expect([...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      null,
      null,
      null,
      null,
      'https://ok',
      'mailto:a@b',
      '#x',
      null,
      null,
    ]);
  });

  it('restricts img src to https, mpp-file and image data URIs', () => {
    const root = parse(
      '<img src="javascript:alert(1)"><img src="data:text/html;base64,AAAA"><img src="data:image/png;base64,AAAA">' +
        '<img src="mpp-file://local/%2Fa.png"><img src="file:///etc/passwd"><img src="relative.png">' +
        '<img src="data:image/svg+xml,%3Csvg%3E"><img src="blob:x"><img src="http://a.b/c.png">',
    );
    expect([...root.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      null,
      null,
      'data:image/png;base64,AAAA',
      'mpp-file://local/%2Fa.png',
      null,
      null,
      'data:image/svg+xml,%3Csvg%3E',
      null,
      null,
    ]);
  });

  it('allows inline styles and SVG only inside KaTeX output', () => {
    const html = sanitizeFragment(
      '<p style="color:red">a</p><svg><path d="M0 0"></path></svg>' +
        '<span class="katex"><span style="height:1em;vertical-align:-0.2em;">x</span>' +
        '<span style="background:url(https://evil/x.png)">y</span><svg width="1em" viewBox="0 0 10 10">' +
        '<path d="M0 0h10"></path></svg></span><span class="katex-error" style="color:#cc0000">\\bad</span>',
    );
    expect(html).toBe(
      '<p>a</p><span class="katex"><span style="height:1em;vertical-align:-0.2em;">x</span><span>y</span>' +
        '<svg width="1em" viewBox="0 0 10 10"><path d="M0 0h10"></path></svg></span>' +
        '<span class="katex-error" style="color:#cc0000">\\bad</span>',
    );
  });

  it('keeps KaTeX MathML including the TeX annotation', () => {
    const math =
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>a</mi></mrow>' +
      '<annotation encoding="application/x-tex">a</annotation></semantics></math>';
    const root = parse(`<span class="katex"><span class="katex-mathml">${math}</span></span>`);
    expect(root.querySelector('semantics')).not.toBeNull();
    expect(root.querySelector('annotation')?.getAttribute('encoding')).toBe('application/x-tex');
    expect(root.querySelector('mi')?.textContent).toBe('a');
  });

  it('keeps only disabled checkboxes and removes other inputs', () => {
    expect(sanitizeFragment('<input type="checkbox"><input type="text" value="x"><input>')).toBe(
      '<input type="checkbox" disabled="">',
    );
  });

  it('does not register hooks on the shared DOMPurify instance', () => {
    expect(DOMPurify.sanitize('<p style="color:red">a</p>')).toBe('<p style="color:red">a</p>');
  });
});

describe('isSafeKatexStyle', () => {
  it.each([
    ['height:0.8141em;', true],
    ['top:-3.063em;margin-right:0.05em;', true],
    ['color:#cc0000', true],
    ['min-width:0.853em;height:1.08em;', true],
    ['background:url(x)', false],
    ['background-image:linear-gradient(red,blue)', false],
    ['width:expression(alert(1))', false],
    ['color:var(--x)', false],
    ['@import "x"', false],
    ['content:"\\41"', false],
    ['behavior:url(x.htc)', false],
  ])('%j -> %s', (style, expected) => {
    expect(isSafeKatexStyle(style)).toBe(expected);
  });
});

describe('ALLOWED_URI_REGEXP', () => {
  it('accepts emitted schemes and plain values and rejects script schemes', () => {
    for (const value of [
      'https://a',
      'http://a',
      'mailto:a',
      'mpp-file://local/x',
      '#x',
      'ts',
      '0 0 10 10',
    ]) {
      expect(ALLOWED_URI_REGEXP.test(value)).toBe(true);
    }
    for (const value of ['javascript:alert(1)', 'vbscript:x', 'data:text/html,x', 'file:///x']) {
      expect(ALLOWED_URI_REGEXP.test(value)).toBe(false);
    }
  });
});
