import { EditorStateReady, editorViewTimerCtx, nodeViewCtx } from '@milkdown/kit/core';
import type { Ctx, TimerType } from '@milkdown/kit/ctx';
import { Schema } from '@milkdown/kit/prose/model';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { EditorView, type NodeViewConstructor } from '@milkdown/kit/prose/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createListItemSelectionGuard, LIST_ITEM_NODE } from './list-item-selection';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
    text: {},
  },
});

let frames: FrameRequestCallback[] = [];
function nextFrame(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback(0);
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Mimics Crepe's list item view: it restores the selection captured at mount in the next frame. */
const crepeLikeView: NodeViewConstructor = (_node, view) => {
  const { anchor, head } = view.state.selection;
  requestAnimationFrame(() => {
    const { state } = view;
    view.dispatch(
      state.tr.setSelection(TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(head))),
    );
  });
  const dom = document.createElement('p');
  return { dom, contentDOM: dom };
};

function mount(text: string, caret: number) {
  const guard = createListItemSelectionGuard();
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text === '' ? [] : [schema.text(text)]),
  ]);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, caret),
    plugins: [guard.plugin],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView(host, { state, nodeViews: { paragraph: guard.wrap(crepeLikeView) } });
  return { view, guard };
}

describe('createListItemSelectionGuard', () => {
  it('drops the stale restore after a key typed right after the view mounted', () => {
    const { view } = mount('', 1);
    view.dispatch(view.state.tr.insertText('s'));
    expect(view.state.selection.from).toBe(2);
    nextFrame();
    // Without the guard the caret would be back at 1 and `econd` would be typed before `s`.
    expect(view.state.selection.from).toBe(2);
    view.dispatch(view.state.tr.insertText('econd'));
    expect(view.state.doc.textContent).toBe('second');
    view.destroy();
  });

  it('lets the restore through when nothing changed since the mount', () => {
    const { view } = mount('abc', 2);
    const dispatch = vi.spyOn(view, 'dispatch');
    nextFrame();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(view.state.selection.from).toBe(2);
    view.destroy();
  });

  it('only filters plain selection-only transactions to the recorded selection', () => {
    const { view } = mount('abc', 1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    // A pointer selection (a click) to the recorded position is intentional.
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).setMeta('pointer', true),
    );
    expect(view.state.selection.from).toBe(1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    // Other targets and document changes are never filtered.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    expect(view.state.selection.from).toBe(2);
    view.dispatch(view.state.tr.insertText('x', 1));
    expect(view.state.doc.textContent).toBe('xabc');
    expect(view.state.selection.from).toBe(3);
    // A plain selection back to the recorded position while the state has moved on is the stale restore.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(view.state.selection.from).toBe(3);
    view.destroy();
  });

  it('stops guarding two frames after the mount', () => {
    const { view } = mount('abc', 1);
    nextFrame();
    nextFrame();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(view.state.selection.from).toBe(1);
    view.destroy();
  });

  it('wraps the list item node view before the editor view is created', async () => {
    const guard = createListItemSelectionGuard();
    const listItem = vi.fn<NodeViewConstructor>(crepeLikeView);
    const other = vi.fn<NodeViewConstructor>();
    let views: [string, NodeViewConstructor][] = [
      [LIST_ITEM_NODE, listItem],
      ['paragraph', other],
    ];
    let timers: TimerType[] = [];
    const record = vi.fn();
    const done = vi.fn();
    const clearTimer = vi.fn();
    const wait = vi.fn(() => Promise.resolve());
    const ctx = {
      record,
      done,
      clearTimer,
      wait,
      update: (slice: unknown, update: (value: never) => never) => {
        if (slice === nodeViewCtx) views = update(views as never);
        else if (slice === editorViewTimerCtx) timers = update(timers as never);
        else throw new Error('unexpected slice');
      },
    } as unknown as Ctx;
    const run = guard.milkdownPlugin(ctx);
    expect(record).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);
    const cleanup = await run();
    expect(wait).toHaveBeenCalledWith(EditorStateReady);
    expect(done).toHaveBeenCalledWith(timers[0]);
    expect(views[0]?.[1]).not.toBe(listItem);
    expect(views[1]?.[1]).toBe(other);
    if (typeof cleanup !== 'function') throw new Error('expected a cleanup function');
    await cleanup();
    expect(timers).toHaveLength(0);
    expect(clearTimer).toHaveBeenCalledTimes(1);
  });
});
