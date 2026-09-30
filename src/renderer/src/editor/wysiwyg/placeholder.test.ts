import { Schema } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import type { DecorationSet } from '@milkdown/kit/prose/view';
import { describe, expect, it } from 'vitest';
import { createPlaceholderPlugin, PLACEHOLDER_CLASSES, placeholderDecorations } from './placeholder';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    code_block: { group: 'block', content: 'text*', code: true },
    rule: { group: 'block' },
    text: {},
  },
});

const stateOf = (...blocks: ReturnType<Schema['node']>[]) =>
  EditorState.create({ doc: schema.node('doc', null, blocks) });

describe('placeholderDecorations', () => {
  it('decorates the only, empty paragraph', () => {
    const decorations = placeholderDecorations(stateOf(schema.node('paragraph')), 'Type…');
    const [decoration] = decorations?.find() ?? [];
    expect(decoration?.from).toBe(0);
    expect((decoration as unknown as { type: { attrs: Record<string, string> } }).type.attrs).toEqual({
      class: PLACEHOLDER_CLASSES,
      'data-placeholder': 'Type…',
    });
  });

  it('shows nothing for content, several blocks, code blocks or an empty text', () => {
    expect(
      placeholderDecorations(stateOf(schema.node('paragraph', null, [schema.text('a')])), 'x'),
    ).toBeNull();
    expect(
      placeholderDecorations(stateOf(schema.node('paragraph'), schema.node('paragraph')), 'x'),
    ).toBeNull();
    expect(placeholderDecorations(stateOf(schema.node('code_block')), 'x')).toBeNull();
    expect(placeholderDecorations(stateOf(schema.node('rule')), 'x')).toBeNull();
    expect(placeholderDecorations(stateOf(schema.node('paragraph')), '')).toBeNull();
  });

  it('reads the text lazily through the plugin', () => {
    let text = 'First';
    const plugin = createPlaceholderPlugin(() => text);
    const state = EditorState.create({
      doc: schema.node('doc', null, [schema.node('paragraph')]),
      plugins: [plugin],
    });
    const render = () => (plugin.props.decorations?.call(plugin, state) as DecorationSet | null)?.find()[0];
    expect(render()).toBeDefined();
    text = '';
    expect(render()).toBeUndefined();
  });
});
