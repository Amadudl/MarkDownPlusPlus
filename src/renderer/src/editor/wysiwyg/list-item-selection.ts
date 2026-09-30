import { EditorStateReady, editorViewTimerCtx, nodeViewCtx } from '@milkdown/kit/core';
import { createTimer, type MilkdownPlugin } from '@milkdown/kit/ctx';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import {
  type EditorState,
  Plugin,
  PluginKey,
  type Selection,
  type Transaction,
} from '@milkdown/kit/prose/state';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';

/** Name of the list item node whose Crepe node view is guarded. */
export const LIST_ITEM_NODE = 'list_item';

/** The editor state at the moment a list item node view was created. */
interface MountRecord {
  readonly doc: ProseNode;
  readonly selection: Selection;
}

/** The pieces of {@link createListItemSelectionGuard}. */
export interface ListItemSelectionGuard {
  /** ProseMirror plugin that drops stale selection restores. */
  readonly plugin: Plugin;
  /** Milkdown plugin that wraps the list item node view before the editor view is created. */
  readonly milkdownPlugin: MilkdownPlugin;
  /** Wraps a list item node view constructor (exposed for tests). */
  wrap(construct: NodeViewConstructor): NodeViewConstructor;
}

const guardKey = new PluginKey('mpp-list-item-selection-guard');

/**
 * Works around a race in Crepe's list item node view
 * (`@milkdown/components/list-item-block`): when the view mounts it captures
 * the selection and restores exactly that selection in the next animation
 * frame. A key typed within that frame (right after Enter in a list, with key
 * rollover or a text expander) moves the caret, and the restore then puts it
 * back before the typed character, so typing `second` yields `econds`.
 *
 * The guard records the editor state whenever a list item view is created and
 * rejects a plain selection-only transaction to the recorded selection when
 * the document or the selection changed since: such a transaction can only be
 * the stale restore. Records expire after two animation frames.
 */
export function createListItemSelectionGuard(): ListItemSelectionGuard {
  const records = new Set<MountRecord>();

  const isStaleRestore = (tr: Transaction, state: EditorState): boolean => {
    if (records.size === 0 || tr.docChanged || !tr.selectionSet || !tr.isGeneric) return false;
    const { anchor, head } = tr.selection;
    for (const record of records) {
      const moved = record.doc !== state.doc || !record.selection.eq(state.selection);
      if (moved && record.selection.anchor === anchor && record.selection.head === head) return true;
    }
    return false;
  };

  const plugin = new Plugin({
    key: guardKey,
    filterTransaction: (tr, state) => !isStaleRestore(tr, state),
  });

  const wrap =
    (construct: NodeViewConstructor): NodeViewConstructor =>
    (node, view, getPos, decorations, innerDecorations) => {
      const record: MountRecord = { doc: view.state.doc, selection: view.state.selection };
      records.add(record);
      const created = construct(node, view, getPos, decorations, innerDecorations);
      // Crepe schedules its restore while the view is constructed; two frames later it has run.
      requestAnimationFrame(() => requestAnimationFrame(() => records.delete(record)));
      return created;
    };

  const ready = createTimer('MppListItemSelectionGuardReady');
  const milkdownPlugin: MilkdownPlugin = (ctx) => {
    ctx.record(ready);
    ctx.update(editorViewTimerCtx, (timers) => timers.concat(ready));
    return async () => {
      // Node views are registered once the schema is ready; the editor view waits for this timer.
      await ctx.wait(EditorStateReady);
      ctx.update(nodeViewCtx, (views) =>
        views.map(([name, view]): [string, NodeViewConstructor] => [
          name,
          name === LIST_ITEM_NODE ? wrap(view) : view,
        ]),
      );
      ctx.done(ready);
      return () => {
        records.clear();
        ctx.update(editorViewTimerCtx, (timers) => timers.filter((timer) => timer !== ready));
        ctx.clearTimer(ready);
      };
    };
  };

  return { plugin, milkdownPlugin, wrap };
}
