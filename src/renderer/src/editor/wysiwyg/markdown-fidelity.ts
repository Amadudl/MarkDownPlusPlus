import { imageBlockSchema } from '@milkdown/kit/component/image-block';
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { MarkdownNode } from '@milkdown/kit/transformer';
import { $remark } from '@milkdown/kit/utils';

/**
 * Plugins and configuration that make Milkdown's markdown round trip lossless
 * for the constructs MarkDown++ users rely on. Each fix addresses a concrete
 * data-loss problem of the stock Crepe setup; see the unit tests.
 */

/** Markdown serialisation style (matches what most people write by hand and what GitHub renders). */
export const STRINGIFY_OPTIONS = {
  bullet: '-',
  bulletOther: '*',
  rule: '-',
  fence: '`',
  fences: true,
  emphasis: '*',
  strong: '*',
  listItemIndent: 'one',
  incrementListMarker: true,
} as const;

/** Applies {@link STRINGIFY_OPTIONS} on top of Milkdown's defaults (which keep its custom handlers). */
export function configureMarkdownStyle(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (previous) => ({ ...previous, ...STRINGIFY_OPTIONS }));
}

function visit(node: MarkdownNode, visitor: (node: MarkdownNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) visit(child, visitor);
}

/** `value` when it is a string, otherwise `fallback` (markdown AST and node attributes are untyped). */
export function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * mdast images without a title carry `title: null`, but the ProseMirror image
 * schemas validate `title`/`caption` as strings. Without this normalisation
 * Milkdown throws while parsing and silently drops every standalone image.
 */
export function normalizeImageNodes(tree: MarkdownNode): void {
  visit(tree, (node) => {
    if (node.type !== 'image' && node.type !== 'image-block') return;
    node.title = stringOr(node.title);
    node.alt = stringOr(node.alt);
  });
}

/** Remark plugin wrapper of {@link normalizeImageNodes}. */
export const remarkNormalizeImages = $remark('mppNormalizeImages', () => () => (tree) => {
  normalizeImageNodes(tree as MarkdownNode);
});

/**
 * Crepe's image block stores its display ratio in the markdown `alt` text
 * (`![1.00](src)`), which destroys the real alternative text of every image.
 * The override keeps the alt text: a numeric alt is still read as a ratio for
 * compatibility (only Crepe's `0.00` format), a resized image (ratio ≠ 1) is
 * written as its ratio, and in every other case the original alternative text
 * is written back.
 */
export function parseImageAlt(alt: unknown): { ratio: number; alt: string } {
  const text = stringOr(alt);
  // Crepe writes ratios with `toFixed(2)`; only that exact shape is read as a ratio.
  const numeric = /^\d+\.\d{2}$/.test(text) ? Number(text) : Number.NaN;
  if (Number.isFinite(numeric) && numeric > 0) return { ratio: numeric, alt: '' };
  return { ratio: 1, alt: text };
}

/** Inverse of {@link parseImageAlt}. */
export function serializeImageAlt(ratio: unknown, alt: unknown): string {
  const value = Number(ratio);
  if (Number.isFinite(value) && value > 0 && Math.abs(value - 1) > 1e-3) return value.toFixed(2);
  return stringOr(alt);
}

/** Replaces the image-block schema's markdown mapping with the alt-preserving one. */
export function configureImageBlockAlt(ctx: Ctx): void {
  ctx.update(imageBlockSchema.ctx.key, (factory) => (innerCtx) => {
    const schema = factory(innerCtx);
    return {
      ...schema,
      attrs: { ...schema.attrs, alt: { default: '', validate: 'string' } },
      parseMarkdown: {
        match: schema.parseMarkdown.match,
        runner: (state, node, type) => {
          const { ratio, alt } = parseImageAlt(node.alt);
          state.addNode(type, { src: stringOr(node.url), caption: stringOr(node.title), ratio, alt });
        },
      },
      toMarkdown: {
        match: schema.toMarkdown.match,
        runner: (state, node) => {
          const caption = stringOr(node.attrs.caption);
          state.openNode('paragraph');
          state.addNode('image', undefined, undefined, {
            title: caption === '' ? null : caption,
            url: stringOr(node.attrs.src),
            alt: serializeImageAlt(node.attrs.ratio, node.attrs.alt),
          });
          state.closeNode();
        },
      },
    };
  });
}
