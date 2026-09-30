import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import type { Element, Root } from 'hast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it, vi } from 'vitest';
import { text } from './hast-utils';
import { createParserResolver } from './languages';
import { languageOf, rehypeCodeBlocks } from './rehype-code-blocks';
import { BLOCKED_IMAGE_FALLBACK, rehypeImages, restoreWindowsPath } from './rehype-images';
import { isAllowedHref, rehypeLinks } from './rehype-links';
import { rehypeHeadingIds, rehypeTableWrap, rehypeTaskLists } from './rehype-structure';

type Transformer = (tree: Root) => void | Promise<void>;

/** Runs markdown through remark-rehype, then `transform`, and returns the HTML. */
async function run(markdown: string, transform: Transformer): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(() => transform)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

/** Runs a transformer on a hand-built tree. */
async function runTree(children: Root['children'], transform: Transformer): Promise<Root> {
  const tree: Root = { type: 'root', children };
  await transform(tree);
  return tree;
}

function el(
  tagName: string,
  properties: Element['properties'] = {},
  children: Element['children'] = [],
): Element {
  return { type: 'element', tagName, properties, children };
}

/** A tiny test language that marks every `x` as a keyword. */
const xLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eat('x')) return 'keyword';
    stream.next();
    return null;
  },
});

function testResolver(): ReturnType<typeof createParserResolver> {
  return createParserResolver([
    LanguageDescription.of({
      name: 'Xlang',
      alias: ['x'],
      load: () => Promise.resolve(new LanguageSupport(xLanguage)),
    }),
  ]);
}

describe('rehypeCodeBlocks', () => {
  it('wraps highlighted code in a figure with a language caption', async () => {
    const html = await run('```x\naxb\n```', rehypeCodeBlocks({ resolveParser: testResolver() }));
    expect(html).toBe(
      '<figure class="mpp-code-block" data-language="x"><figcaption class="mpp-code-lang">x</figcaption>' +
        '<pre><code class="language-x"><span class="mpp-code-line">a<span class="tok-keyword">x</span>b</span></code></pre></figure>',
    );
  });

  it('keeps unknown languages as escaped plain text', async () => {
    const html = await run('```nope\n<b>&</b>\n```', rehypeCodeBlocks({ resolveParser: testResolver() }));
    expect(html).toContain('data-language="nope"');
    expect(html).toContain(
      '<code class="language-nope"><span class="mpp-code-line">&#x3C;b>&#x26;&#x3C;/b></span></code>',
    );
  });

  it('renders code blocks without a language without caption or data-language', async () => {
    const resolveParser = vi.fn(testResolver());
    const html = await run('```\nplain x\n```\n\n    indented', rehypeCodeBlocks({ resolveParser }));
    expect(html).toBe(
      '<figure class="mpp-code-block"><pre><code><span class="mpp-code-line">plain x</span></code></pre></figure>\n' +
        '<figure class="mpp-code-block"><pre><code><span class="mpp-code-line">indented</span></code></pre></figure>',
    );
    expect(resolveParser).not.toHaveBeenCalled();
  });

  it('wraps every source line, including plain and multi-line tokens, in mpp-code-line spans', async () => {
    const html = await run(
      '```x\nx1\n\nx2\n```\n\n```\none\ntwo\n```',
      rehypeCodeBlocks({ resolveParser: testResolver() }),
    );
    expect(html).toBe(
      '<figure class="mpp-code-block" data-language="x"><figcaption class="mpp-code-lang">x</figcaption>' +
        '<pre><code class="language-x"><span class="mpp-code-line"><span class="tok-keyword">x</span>1</span>\n' +
        '<span class="mpp-code-line"></span>\n' +
        '<span class="mpp-code-line"><span class="tok-keyword">x</span>2</span></code></pre></figure>\n' +
        '<figure class="mpp-code-block"><pre><code><span class="mpp-code-line">one</span>\n' +
        '<span class="mpp-code-line">two</span></code></pre></figure>',
    );
  });

  it('renders an empty code block as one empty line', async () => {
    const html = await run('```x\n```', rehypeCodeBlocks({ resolveParser: testResolver() }));
    expect(html).toContain('<code class="language-x"><span class="mpp-code-line"></span></code>');
  });

  it('loads each distinct language once per document', async () => {
    const resolveParser = vi.fn(testResolver());
    await run('```x\n1\n```\n\n```x\n2\n```\n\n```y\n3\n```', rehypeCodeBlocks({ resolveParser }));
    expect(resolveParser.mock.calls).toEqual([['x'], ['y']]);
  });

  it('ignores pre elements that do not contain exactly one code element', async () => {
    const pre = el('pre', {}, [text('raw')]);
    const preWithTwo = el('pre', {}, [el('code'), el('code')]);
    const tree = await runTree([pre, preWithTwo], rehypeCodeBlocks({ resolveParser: testResolver() }));
    expect(tree.children).toEqual([pre, preWithTwo]);
  });

  it('extracts only plausible language names from the class', () => {
    expect(languageOf(el('code', { className: ['language-ts'] }))).toBe('ts');
    expect(languageOf(el('code', { className: ['other'] }))).toBeNull();
    expect(languageOf(el('code', { className: ['language-a"b'] }))).toBeNull();
  });
});

describe('rehypeImages', () => {
  const local = { documentPath: '/home/me/docs/readme.md', loadRemoteImages: false };

  it('resolves relative and absolute paths to mpp-file URLs and lazy-loads them', async () => {
    const html = await run('![a](img/pic.png) ![b](/abs/x.jpg)', rehypeImages(local));
    expect(html).toContain(
      '<img src="mpp-file://local/%2Fhome%2Fme%2Fdocs%2Fimg%2Fpic.png" alt="a" loading="lazy">',
    );
    expect(html).toContain('<img src="mpp-file://local/%2Fabs%2Fx.jpg" alt="b" loading="lazy">');
  });

  it('keeps remote images only when allowed', async () => {
    const md = '![r](https://example.com/r.png)';
    expect(await run(md, rehypeImages({ ...local, loadRemoteImages: true }))).toContain(
      '<img src="https://example.com/r.png" alt="r" loading="lazy">',
    );
    expect(await run(md, rehypeImages(local))).toBe(
      '<p><span class="mpp-image-blocked" title="Image not loaded">r</span></p>',
    );
  });

  it('blocks unsafe schemes, insecure http, blob URLs and unresolvable relative paths', async () => {
    const html = await run(
      '![js](javascript:alert(1)) ![blob](blob:abc) ![rel](x.png) ![](javascript:void(0)) ![insecure](http://a.b/c.png)',
      rehypeImages({ documentPath: null, loadRemoteImages: true }),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('>js</span>');
    expect(html).toContain('>blob</span>');
    expect(html).toContain('>rel</span>');
    expect(html).toContain('>insecure</span>');
    expect(html).toContain(`>${BLOCKED_IMAGE_FALLBACK}</span>`);
  });

  it('restores percent-encoded backslashes of Windows drive paths only', () => {
    expect(restoreWindowsPath('C:%5Cpics%5Ca.png')).toBe('C:\\pics\\a.png');
    expect(restoreWindowsPath('dir%5Ca.png')).toBe('dir%5Ca.png');
  });

  it('treats images without src or alt as blocked', async () => {
    const tree = await runTree([el('img')], rehypeImages(local));
    expect(tree.children[0]).toMatchObject({
      tagName: 'span',
      children: [{ value: BLOCKED_IMAGE_FALLBACK }],
    });
  });
});

describe('rehypeLinks', () => {
  it('allows only web, mail and fragment links', () => {
    expect(isAllowedHref('https://a.b')).toBe(true);
    expect(isAllowedHref('HTTP://a.b')).toBe(true);
    expect(isAllowedHref('mailto:a@b.c')).toBe(true);
    expect(isAllowedHref('#top')).toBe(true);
    expect(isAllowedHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedHref('data:text/html,x')).toBe(false);
    expect(isAllowedHref('file:///etc/passwd')).toBe(false);
    expect(isAllowedHref('other.md')).toBe(false);
    expect(isAllowedHref('')).toBe(false);
  });

  it('unwraps disallowed links, keeping their content', async () => {
    const html = await run(
      '[js](javascript:alert(1)) [data](data:text/html,x) [**rel**](./other.md)',
      rehypeLinks(),
    );
    expect(html).toBe('<p>js data <strong>rel</strong></p>');
  });

  it('adds rel to external links only and removes target', async () => {
    const html = await run('[w](https://example.com) [m](mailto:me@example.com) [f](#intro)', rehypeLinks());
    expect(html).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer">w</a> ' +
        '<a href="mailto:me@example.com">m</a> <a href="#intro">f</a></p>',
    );
    const tree = await runTree(
      [el('a', { href: ' https://x.y ', target: '_blank' }), el('a')],
      rehypeLinks(),
    );
    expect(tree.children).toEqual([el('a', { href: 'https://x.y', rel: ['noopener', 'noreferrer'] })]);
  });
});

describe('rehypeTableWrap', () => {
  it('wraps GFM tables in a scroll container', async () => {
    const html = await run('| a |\n|---|\n| 1 |', rehypeTableWrap());
    expect(html.startsWith('<div class="mpp-table-wrap"><table>')).toBe(true);
    expect(html.endsWith('</table></div>')).toBe(true);
  });
});

describe('rehypeTaskLists', () => {
  it('marks tight and loose task items and disables their checkboxes', async () => {
    const html = await run(
      '- [x] done\n- [ ] open\n\n* [ ] loose\n\n* [x] items\n\n- normal',
      rehypeTaskLists(),
    );
    expect(html.match(/<li class="task-list-item">/g)).toHaveLength(4);
    expect(html.match(/<input type="checkbox" disabled>/g)).toHaveLength(2);
    expect(html.match(/<input type="checkbox" checked disabled>/g)).toHaveLength(2);
    expect(html).toContain('<li>normal</li>');
  });

  it('adds the class and disabled flag when missing and removes stray inputs', async () => {
    const checkbox = el('input', { type: 'checkbox' });
    const item = el('li', {}, [text('\n'), checkbox, text(' todo')]);
    const tree = await runTree(
      [item, el('li', {}, [el('input', { type: 'text' })]), el('p', {}, [el('input', { type: 'checkbox' })])],
      rehypeTaskLists(),
    );
    expect(item.properties.className).toEqual(['task-list-item']);
    expect(checkbox.properties.disabled).toBe(true);
    expect(tree.children[1]).toEqual(el('li', {}, []));
    expect(tree.children[2]).toEqual(el('p', {}, []));
  });

  it('ignores list items that start with a paragraph without a checkbox', async () => {
    const item = el('li', {}, [el('p', {}, [text('text')])]);
    await runTree([item], rehypeTaskLists());
    expect(item.properties.className).toBeUndefined();
  });
});

describe('rehypeHeadingIds', () => {
  it('assigns unique slug ids to headings', async () => {
    const html = await run('# Intro\n\n## Intro\n\n### *Rich* `code` heading', rehypeHeadingIds());
    expect(html).toBe(
      '<h1 id="intro">Intro</h1>\n<h2 id="intro-1">Intro</h2>\n' +
        '<h3 id="rich-code-heading"><em>Rich</em> <code>code</code> heading</h3>',
    );
  });

  it('keeps existing ids, reserves them and skips forbidden ids', async () => {
    const existing = el('h2', { id: 'notes' }, [text('Footnotes')]);
    const tree = await runTree(
      [existing, el('h1', {}, [text('Notes')]), el('h4', {}, [text('Location')]), el('p', {}, [text('x')])],
      rehypeHeadingIds({ isForbiddenId: (id) => id === 'location' }),
    );
    expect(tree.children.map((node) => (node.type === 'element' ? node.properties.id : null))).toEqual([
      'notes',
      'notes-1',
      'location-1',
      undefined,
    ]);
  });
});
