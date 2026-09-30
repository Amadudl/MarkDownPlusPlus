import type { Element, ElementContent, Root } from 'hast';
import { classList, rewriteElements, text, textContent } from './hast-utils';
import { highlightCode, wrapCodeLines } from './highlight';
import { normalizeLanguageName } from './languages';
import type { CodeParser, ParserResolver } from './languages';

export interface CodeBlockOptions {
  /** Loads the parser for a language name; null means "render as plain text". */
  readonly resolveParser: ParserResolver;
}

/** The `<code>` child of a `<pre>` produced by remark-rehype, or null for any other element. */
function codeOfPre(element: Element): Element | null {
  if (element.tagName !== 'pre') return null;
  const [first] = element.children;
  return element.children.length === 1 && first?.type === 'element' && first.tagName === 'code'
    ? first
    : null;
}

/** Language name from a `language-xyz` class, or null when absent or implausible. */
export function languageOf(code: Element): string | null {
  const languageClass = classList(code).find((name) => name.startsWith('language-'));
  return languageClass === undefined ? null : normalizeLanguageName(languageClass.slice('language-'.length));
}

function buildFigure(source: string, language: string | null, parser: CodeParser | null): Element {
  const codeElement: Element = {
    type: 'element',
    tagName: 'code',
    properties: language === null ? {} : { className: [`language-${language}`] },
    children: wrapCodeLines(parser === null ? [text(source)] : highlightCode(source, parser)),
  };
  const children: ElementContent[] = [];
  if (language !== null) {
    children.push({
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['mpp-code-lang'] },
      children: [text(language)],
    });
  }
  children.push({ type: 'element', tagName: 'pre', properties: {}, children: [codeElement] });
  return {
    type: 'element',
    tagName: 'figure',
    properties:
      language === null
        ? { className: ['mpp-code-block'] }
        : { className: ['mpp-code-block'], dataLanguage: language },
    children,
  };
}

/**
 * Rehype plugin that turns every fenced code block (`<pre><code class="language-x">`) into
 * `<figure class="mpp-code-block" data-language="x"><figcaption class="mpp-code-lang">x</figcaption><pre><code>`
 * with `tok-*` highlighting spans, every source line wrapped in `<span class="mpp-code-line">`
 * (for the themes' optional line numbers). All needed languages are loaded (in parallel) before
 * the tree is rewritten; unknown languages stay plain, escaped text.
 */
export function rehypeCodeBlocks(options: CodeBlockOptions): (tree: Root) => Promise<void> {
  return async (tree: Root) => {
    const blocks: { pre: Element; code: Element; language: string | null }[] = [];
    rewriteElements(tree, (element) => {
      const code = codeOfPre(element);
      if (code !== null) blocks.push({ pre: element, code, language: languageOf(code) });
      return undefined;
    });
    const names = [...new Set(blocks.map((block) => block.language).filter((name) => name !== null))];
    const parsers = new Map<string, CodeParser | null>(
      await Promise.all(names.map(async (name) => [name, await options.resolveParser(name)] as const)),
    );
    const figures = new Map<Element, Element>(
      blocks.map((block) => [
        block.pre,
        buildFigure(
          textContent(block.code),
          block.language,
          block.language === null ? null : (parsers.get(block.language) ?? null),
        ),
      ]),
    );
    rewriteElements(tree, (element) => figures.get(element));
  };
}
