import { nodeViewCtx, SchemaReady } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { Schema } from '@milkdown/kit/prose/model';
import type { EditorView, NodeViewConstructor } from '@milkdown/kit/prose/view';
import { describe, expect, it, vi } from 'vitest';
import {
  boundedInlineMath,
  inlineMathNodeView,
  MATH_INLINE_NODE,
  renderInlineMath,
  WYSIWYG_KATEX_OPTIONS,
} from './inline-math';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    math_inline: { group: 'inline', inline: true, atom: true, attrs: { value: { default: '' } } },
    other: { group: 'inline', inline: true, atom: true, attrs: { value: { default: '' } } },
  },
});

const math = (value: string) => schema.node('math_inline', { value });
const view = {} as EditorView;
const construct = (value: string) => inlineMathNodeView(math(value), view, () => 0, [], {} as never);

describe('renderInlineMath', () => {
  it('bounds sizes with the configured maxSize and records the source', () => {
    const dom = document.createElement('span');
    renderInlineMath(dom, '\\rule{99999em}{99999em}');
    expect(dom.dataset.type).toBe(MATH_INLINE_NODE);
    expect(dom.dataset.value).toBe('\\rule{99999em}{99999em}');
    const html = dom.querySelector('.katex-html')?.innerHTML ?? '';
    expect(html).toContain(`${WYSIWYG_KATEX_OPTIONS.maxSize}em`);
    expect(html).not.toContain('99999em');
  });

  it('renders errors instead of throwing and keeps untrusted commands disabled', () => {
    const dom = document.createElement('span');
    renderInlineMath(dom, '\\frac{');
    expect(dom.querySelector('.katex-error')).not.toBeNull();
    renderInlineMath(dom, '\\href{javascript:alert(1)}{x}');
    expect(dom.querySelector('a')).toBeNull();
  });

  it('stops runaway macro expansion', () => {
    const dom = document.createElement('span');
    renderInlineMath(dom, '\\def\\a{\\a\\a}\\a');
    expect(dom.querySelector('.katex-error')?.textContent).toBe('\\def\\a{\\a\\a}\\a');
  });
});

describe('inlineMathNodeView', () => {
  it('renders the value and re-renders only when it changes', () => {
    const nodeView = construct('x^2');
    const { dom } = nodeView;
    expect(dom).toBeInstanceOf(HTMLSpanElement);
    const first = dom.innerHTML;
    expect(nodeView.update?.(math('x^2'), [], {} as never)).toBe(true);
    expect(dom.innerHTML).toBe(first);
    expect(nodeView.update?.(math('y_1'), [], {} as never)).toBe(true);
    expect(dom.dataset.value).toBe('y_1');
    expect(nodeView.update?.(schema.node('other', { value: 'z' }), [], {} as never)).toBe(false);
    expect(nodeView.ignoreMutation?.({ type: 'characterData' } as MutationRecord)).toBe(true);
  });

  it('treats a missing value as empty', () => {
    const nodeView = inlineMathNodeView(
      schema.node('math_inline', { value: null }),
      view,
      () => 0,
      [],
      {} as never,
    );
    expect(nodeView.dom.dataset.value).toBe('');
  });
});

describe('boundedInlineMath', () => {
  it('registers the node view after the schema is ready and removes it on cleanup', async () => {
    let views: [string, NodeViewConstructor][] = [
      [MATH_INLINE_NODE, vi.fn()],
      ['paragraph', vi.fn()],
    ];
    const wait = vi.fn(() => Promise.resolve());
    const ctx = {
      wait,
      update: (slice: unknown, update: (value: typeof views) => typeof views) => {
        expect(slice).toBe(nodeViewCtx);
        views = update(views);
      },
    } as unknown as Ctx;
    const cleanup = await boundedInlineMath(ctx)();
    expect(wait).toHaveBeenCalledWith(SchemaReady);
    expect(views.map(([name]) => name)).toEqual(['paragraph', MATH_INLINE_NODE]);
    expect(views.at(-1)?.[1]).toBe(inlineMathNodeView);
    if (typeof cleanup !== 'function') throw new Error('expected a cleanup function');
    await cleanup();
    expect(views.map(([name]) => name)).toEqual(['paragraph']);
  });
});
