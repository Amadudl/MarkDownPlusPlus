import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  createCodeBlockCommand,
  headingSchema,
  hrSchema,
  liftListItemCommand,
  orderedListSchema,
  paragraphSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import type { Node as ProseNode, NodeType, ResolvedPos } from '@milkdown/kit/prose/model';
import { type EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { liftTarget } from '@milkdown/kit/prose/transform';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { CursorInfo, FormatCommand } from '../types';

/** The closest ancestor of `$pos` whose type is one of `types`, with its depth and position. */
export interface AncestorInfo {
  readonly node: ProseNode;
  readonly depth: number;
  readonly pos: number;
}

/** Finds the innermost ancestor of `$pos` (including its parent) matching `predicate`. */
export function findAncestor(
  $pos: ResolvedPos,
  predicate: (node: ProseNode) => boolean,
): AncestorInfo | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (predicate(node)) return { node, depth, pos: $pos.before(depth) };
  }
  return null;
}

/** 1-based index of the top-level block containing the selection head, and the selection length. */
export function wysiwygCursorInfo(state: EditorState): CursorInfo {
  const { selection, doc } = state;
  // Milkdown documents always contain at least one block.
  const line = Math.min(selection.$head.index(0), doc.childCount - 1) + 1;
  const selectionLength = selection.empty
    ? 0
    : doc.textBetween(selection.from, selection.to, '\n', ' ').length;
  return { line, column: 0, selectionLength };
}

/** Document position of the n-th (0-based) top-level heading, or null. */
export function topLevelHeadingPosition(doc: ProseNode, index: number): number | null {
  if (!Number.isInteger(index) || index < 0) return null;
  let seen = 0;
  let found: number | null = null;
  doc.forEach((child, offset) => {
    if (found !== null || child.type.name !== 'heading') return;
    if (seen === index) found = offset;
    seen += 1;
  });
  return found;
}

/** Sets `checked` on every item of the list at `listPos` that overlaps the selection. */
function setTaskState(view: EditorView, listPos: number, checked: boolean | null): void {
  const { state } = view;
  // Resolve the list freshly: its type or item attributes may have just changed.
  const list = state.doc.resolve(listPos + 1).parent;
  const { from, to } = state.selection;
  const tr = state.tr;
  list.forEach((item, offset) => {
    const itemPos = listPos + 1 + offset;
    if (itemPos + item.nodeSize < from || itemPos > to) return;
    tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, checked });
  });
  view.dispatch(tr);
}

function findList(state: EditorState, ctx: Ctx): AncestorInfo | null {
  const bullet = bulletListSchema.type(ctx);
  const ordered = orderedListSchema.type(ctx);
  return findAncestor(state.selection.$from, (node) => node.type === bullet || node.type === ordered);
}

function isTaskList(list: ProseNode): boolean {
  return typeof list.firstChild?.attrs.checked === 'boolean';
}

/**
 * Changes a list between bullet and ordered. The items' `listType`/`label`
 * attributes are updated as well, otherwise Milkdown's list-order plugin
 * would convert the list straight back.
 */
function changeListType(view: EditorView, list: AncestorInfo, type: NodeType, ordered: boolean): void {
  const tr = view.state.tr.setNodeMarkup(list.pos, type, list.node.attrs);
  list.node.forEach((item, offset, index) => {
    const listType = ordered ? 'ordered' : 'bullet';
    const label = ordered ? `${index + 1}.` : '•';
    tr.setNodeMarkup(list.pos + 1 + offset, undefined, { ...item.attrs, listType, label });
  });
  view.dispatch(tr.scrollIntoView());
}

function toggleList(ctx: Ctx, view: EditorView, kind: 'bullet' | 'ordered' | 'task'): boolean {
  const commands = ctx.get(commandsCtx);
  const bullet = bulletListSchema.type(ctx);
  const ordered = orderedListSchema.type(ctx);
  const list = findList(view.state, ctx);

  if (list === null) {
    if (kind === 'ordered') return commands.call(wrapInOrderedListCommand.key);
    if (!commands.call(wrapInBulletListCommand.key)) return false;
    // A fresh bullet list becomes a task list through the regular conversion path.
    return kind === 'bullet' || toggleList(ctx, view, 'task');
  }

  const task = isTaskList(list.node);
  const isBullet = list.node.type === bullet;
  switch (kind) {
    case 'bullet':
      if (isBullet && !task) return commands.call(liftListItemCommand.key);
      if (!isBullet) changeListType(view, list, bullet, false);
      if (task) setTaskState(view, list.pos, null);
      return true;
    case 'ordered':
      if (list.node.type === ordered) return commands.call(liftListItemCommand.key);
      changeListType(view, list, ordered, true);
      return true;
    case 'task':
      if (task && isBullet) return commands.call(liftListItemCommand.key);
      if (!isBullet) changeListType(view, list, bullet, false);
      setTaskState(view, list.pos, false);
      return true;
  }
}

function toggleBlockquote(ctx: Ctx, view: EditorView): boolean {
  const blockquote = blockquoteSchema.type(ctx);
  const { $from, $to } = view.state.selection;
  const inQuote = findAncestor($from, (node) => node.type === blockquote);
  if (inQuote === null) return ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key);
  const range = $from.blockRange($to, (node) => node.type === blockquote);
  const target = range === null ? null : liftTarget(range);
  if (range === null || target === null) return false;
  view.dispatch(view.state.tr.lift(range, target).scrollIntoView());
  return true;
}

function toggleHeading(ctx: Ctx, view: EditorView, level: 1 | 2 | 3): boolean {
  const commands = ctx.get(commandsCtx);
  const parent = view.state.selection.$from.parent;
  if (parent.type === headingSchema.type(ctx) && parent.attrs.level === level) {
    return commands.call(turnIntoTextCommand.key);
  }
  return commands.call(wrapInHeadingCommand.key, level);
}

function toggleCodeBlock(ctx: Ctx, view: EditorView): boolean {
  const commands = ctx.get(commandsCtx);
  if (view.state.selection.$from.parent.type === codeBlockSchema.type(ctx)) {
    return commands.call(turnIntoTextCommand.key);
  }
  return commands.call(createCodeBlockCommand.key);
}

/**
 * Block insertions replace the selection. Unless the caret already is in an
 * empty paragraph, a new empty paragraph is opened after the current block, so
 * the inserted block never swallows or splits existing text.
 */
function moveToEmptyParagraph(ctx: Ctx, view: EditorView): void {
  const { $to } = view.state.selection;
  const block = $to.parent;
  if (view.state.selection.empty && block.isTextblock && block.content.size === 0) return;
  const after = $to.after();
  const tr = view.state.tr.insert(after, paragraphSchema.type(ctx).create());
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)));
}

/** Inserts a thematic break after the current block and places the caret in the paragraph after it. */
function insertHorizontalRule(ctx: Ctx, view: EditorView): boolean {
  moveToEmptyParagraph(ctx, view);
  const start = view.state.selection.$from.before();
  const rule = hrSchema.type(ctx).create();
  const tr = view.state.tr.insert(start, rule);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, start + rule.nodeSize + 1)).scrollIntoView());
  return true;
}

/**
 * Runs a {@link FormatCommand} on a mounted Milkdown editor. Block commands
 * toggle: applying the active heading level, list type or quote removes it.
 * Returns false when the command is not applicable at the current selection.
 */
export function runWysiwygCommand(ctx: Ctx, command: FormatCommand): boolean {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);
  switch (command) {
    case 'bold':
      return commands.call(toggleStrongCommand.key);
    case 'italic':
      return commands.call(toggleEmphasisCommand.key);
    case 'strikethrough':
      return commands.call(toggleStrikethroughCommand.key);
    case 'inlineCode':
      return commands.call(toggleInlineCodeCommand.key);
    case 'link':
      // Opens Crepe's link tooltip (or removes an existing link) instead of a modal prompt.
      return commands.call(toggleLinkCommand.key);
    case 'heading1':
      return toggleHeading(ctx, view, 1);
    case 'heading2':
      return toggleHeading(ctx, view, 2);
    case 'heading3':
      return toggleHeading(ctx, view, 3);
    case 'paragraph':
      return commands.call(turnIntoTextCommand.key);
    case 'bulletList':
      return toggleList(ctx, view, 'bullet');
    case 'orderedList':
      return toggleList(ctx, view, 'ordered');
    case 'taskList':
      return toggleList(ctx, view, 'task');
    case 'blockquote':
      return toggleBlockquote(ctx, view);
    case 'codeBlock':
      return toggleCodeBlock(ctx, view);
    case 'table':
      moveToEmptyParagraph(ctx, view);
      return commands.call(insertTableCommand.key, { row: 3, col: 3 });
    case 'horizontalRule':
      return insertHorizontalRule(ctx, view);
  }
}

/** Places the caret at the start of the n-th top-level heading and scrolls it to the top. */
export function scrollToTopLevelHeading(view: EditorView, index: number): boolean {
  const pos = topLevelHeadingPosition(view.state.doc, index);
  if (pos === null) return false;
  const selection = TextSelection.near(view.state.doc.resolve(pos + 1));
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement && typeof dom.scrollIntoView === 'function') {
    dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  view.focus();
  return true;
}
