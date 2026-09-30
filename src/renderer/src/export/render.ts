import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { splitExportFrontMatter } from './front-matter';
import { defaultParserResolver } from './languages';
import type { ParserResolver } from './languages';
import { rehypeCodeBlocks } from './rehype-code-blocks';
import { rehypeImages } from './rehype-images';
import { rehypeLinks } from './rehype-links';
import { rehypeHeadingIds, rehypeTableWrap, rehypeTaskLists } from './rehype-structure';
import { sanitizeFragment } from './sanitize';

export interface RenderOptions {
  /** Absolute path of the document, used to resolve relative image paths. */
  readonly documentPath: string | null;
  /** Whether `http(s):` images are kept. */
  readonly loadRemoteImages: boolean;
  /** Language loader for code highlighting (defaults to the shared, cached one). */
  readonly resolveParser?: ParserResolver;
}

/**
 * True for ids the sanitiser would strip to prevent DOM clobbering (`id="location"`,
 * `id="forms"`, ...); such heading slugs get a numeric suffix instead.
 */
function isClobberingId(id: string): boolean {
  return id in document || id in document.createElement('form');
}

/**
 * Renders markdown (CommonMark + GFM + math) to a sanitised HTML fragment, the inner
 * content of `<article class="mpp-document mpp-export">`.
 *
 * Raw HTML inside the markdown is never rendered: remark-rehype runs with
 * `allowDangerousHtml: false`, which drops HTML nodes, and the result is sanitised
 * with DOMPurify as a second line of defence.
 *
 * Leading YAML (`---`) or TOML (`+++`) front matter is metadata, not content: it is
 * removed before rendering (see {@link splitExportFrontMatter}) instead of showing up as
 * a thematic break plus a setext heading.
 */
export async function renderMarkdownToHtml(markdown: string, options: RenderOptions): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeHeadingIds, { isForbiddenId: isClobberingId })
    .use(rehypeKatex, {
      output: 'htmlAndMathml',
      strict: 'ignore',
      trust: false,
      maxSize: 100,
      maxExpand: 1000,
    })
    .use(rehypeCodeBlocks, { resolveParser: options.resolveParser ?? defaultParserResolver })
    .use(rehypeImages, { documentPath: options.documentPath, loadRemoteImages: options.loadRemoteImages })
    .use(rehypeLinks)
    .use(rehypeTableWrap)
    .use(rehypeTaskLists)
    .use(rehypeStringify)
    .process(splitExportFrontMatter(markdown).body);
  return sanitizeFragment(String(file));
}
