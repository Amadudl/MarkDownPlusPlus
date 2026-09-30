import { nodeViewCtx, SchemaReady } from '@milkdown/kit/core';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { NodeView, NodeViewConstructor } from '@milkdown/kit/prose/view';
import katex, { type KatexOptions } from 'katex';
import { stringOr } from './markdown-fidelity';

/**
 * KaTeX options of Visual mode, for block and inline math alike. `maxSize`
 * (in em) and `maxExpand` bound what a document can make KaTeX build, so
 * expressions such as `\rule{99999em}{99999em}` or runaway macros cannot
 * freeze layout and scrolling. `trust: false` keeps `\href`, `\includegraphics`
 * and HTML extensions disabled.
 */
export const WYSIWYG_KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  maxExpand: 1000,
  maxSize: 50,
} as const satisfies KatexOptions;

/** Name of Crepe's inline math node (`$…$`). */
export const MATH_INLINE_NODE = 'math_inline';

/** Renders inline math `value` into `dom` with {@link WYSIWYG_KATEX_OPTIONS}. */
export function renderInlineMath(dom: HTMLElement, value: string): void {
  dom.dataset.type = MATH_INLINE_NODE;
  dom.dataset.value = value;
  katex.render(value, dom, { ...WYSIWYG_KATEX_OPTIONS, displayMode: false });
}

const valueOf = (node: ProseNode): string => stringOr(node.attrs.value);

/**
 * Node view of inline math. Crepe's schema renders inline math with KaTeX's
 * defaults (unbounded `maxSize`/`maxExpand`) and ignores the configured
 * options, so the editor renders it through this view instead. The markdown
 * mapping (the `value` attribute) is unchanged.
 */
export const inlineMathNodeView: NodeViewConstructor = (initialNode) => {
  const dom = document.createElement('span');
  let value = valueOf(initialNode);
  renderInlineMath(dom, value);
  const view: NodeView = {
    dom,
    update(node) {
      if (node.type !== initialNode.type) return false;
      const next = valueOf(node);
      if (next !== value) {
        value = next;
        renderInlineMath(dom, next);
      }
      return true;
    },
    // KaTeX output is not editable content; ProseMirror must not re-read it.
    ignoreMutation: () => true,
  };
  return view;
};

/** Milkdown plugin registering {@link inlineMathNodeView} for the inline math node. */
export const boundedInlineMath: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const entry: [string, NodeViewConstructor] = [MATH_INLINE_NODE, inlineMathNodeView];
  ctx.update(nodeViewCtx, (views) => [...views.filter(([name]) => name !== MATH_INLINE_NODE), entry]);
  return () => {
    ctx.update(nodeViewCtx, (views) => views.filter(([, view]) => view !== inlineMathNodeView));
  };
};
