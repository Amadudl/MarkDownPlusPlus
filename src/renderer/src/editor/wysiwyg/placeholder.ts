import { type EditorState, Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

/** Classes of the placeholder decoration (Crepe's class is kept so its styles keep working). */
export const PLACEHOLDER_CLASSES = 'crepe-placeholder mpp-placeholder';

const placeholderKey = new PluginKey('mpp-placeholder');

/** The placeholder decoration for `state`: only an empty document (one empty, non-code textblock) gets one. */
export function placeholderDecorations(state: EditorState, text: string): DecorationSet | null {
  const { doc } = state;
  if (text === '' || doc.childCount !== 1) return null;
  const first = doc.child(0);
  if (!first.isTextblock || first.content.size > 0 || first.type.spec.code === true) return null;
  return DecorationSet.create(doc, [
    Decoration.node(0, first.nodeSize, { class: PLACEHOLDER_CLASSES, 'data-placeholder': text }),
  ]);
}

/**
 * Shows `getText()` in an empty document. Unlike Crepe's placeholder feature
 * the text is read on every render, so it can change without recreating the editor.
 */
export function createPlaceholderPlugin(getText: () => string): Plugin {
  return new Plugin({
    key: placeholderKey,
    props: { decorations: (state) => placeholderDecorations(state, getText()) },
  });
}
