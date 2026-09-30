import type { FormatCommand } from '../types';

/**
 * Pure markdown text transformations behind the formatting commands of the
 * source editor. Every function takes the whole document and a selection and
 * returns a single replacement edit plus the selection to apply afterwards,
 * which keeps them trivially testable and makes each command one undo step.
 */

export interface TextSelection {
  /** Start offset (inclusive); always `<= to`. */
  readonly from: number;
  /** End offset (exclusive). */
  readonly to: number;
}

export interface TextEdit {
  /** Start of the replaced range in the original document. */
  readonly from: number;
  /** End of the replaced range in the original document. */
  readonly to: number;
  readonly insert: string;
  /** Selection in the document after the edit has been applied. */
  readonly selection: TextSelection;
}

export type InlineMarker = '**' | '*' | '~~' | '`';
export type LineListKind = 'bullet' | 'ordered' | 'task';

/** Placeholder URL inserted by the link command (selected so it can be typed over). */
export const LINK_URL_PLACEHOLDER = 'https://';

function normalize(doc: string, selection: TextSelection): TextSelection {
  const from = Math.max(0, Math.min(selection.from, selection.to, doc.length));
  const to = Math.min(doc.length, Math.max(selection.from, selection.to, 0));
  return { from, to };
}

function lineStartAt(doc: string, pos: number): number {
  return doc.lastIndexOf('\n', pos - 1) + 1;
}

function lineEndAt(doc: string, pos: number): number {
  const index = doc.indexOf('\n', pos);
  return index === -1 ? doc.length : index;
}

/** Length of the run of `char` ending right before `pos`. */
function runBefore(doc: string, pos: number, char: string): number {
  let count = 0;
  while (pos - count - 1 >= 0 && doc.charAt(pos - count - 1) === char) count += 1;
  return count;
}

/** Length of the run of `char` starting at `pos`. */
function runAfter(doc: string, pos: number, char: string): number {
  let count = 0;
  while (pos + count < doc.length && doc.charAt(pos + count) === char) count += 1;
  return count;
}

/**
 * Whether a delimiter run of `run` characters contains `marker`. Asterisk runs
 * encode both emphasis levels: `*` = italic, `**` = bold, `***` = both.
 */
function runHasMarker(run: number, marker: InlineMarker): boolean {
  if (marker === '*') return run % 2 === 1;
  return run >= marker.length;
}

/** Splits a non-blank segment into leading whitespace, content and trailing whitespace. */
function splitWhitespace(text: string): [leading: string, core: string, trailing: string] {
  const core = text.trim();
  const leadingLength = text.length - text.trimStart().length;
  return [text.slice(0, leadingLength), core, text.slice(leadingLength + core.length)];
}

/** Wraps a non-blank segment, keeping its surrounding whitespace outside the markers. */
function wrapSegment(text: string, marker: InlineMarker): string {
  const [leading, core, trailing] = splitWhitespace(text);
  return `${leading}${marker}${core}${marker}${trailing}`;
}

function segmentIsWrapped(text: string, marker: InlineMarker): boolean {
  const core = text.trim();
  const char = marker.charAt(0);
  if (core.length < marker.length * 2 + 1) return false;
  const start = runAfter(core, 0, char);
  const end = runBefore(core, core.length, char);
  if (start === core.length) return false;
  return runHasMarker(start, marker) && runHasMarker(end, marker);
}

function unwrapSegment(text: string, marker: InlineMarker): string {
  const [leading, core, trailing] = splitWhitespace(text);
  return `${leading}${core.slice(marker.length, core.length - marker.length)}${trailing}`;
}

/**
 * Toggles an inline marker (`**`, `*`, `~~`, `` ` ``) around the selection.
 *
 * - Empty selection: removes an empty pair around the caret or inserts a new
 *   pair with the caret in between.
 * - Selection surrounded by the marker, or starting and ending with it: unwraps.
 * - Otherwise wraps; surrounding whitespace stays outside the markers and a
 *   multi-line selection is wrapped line by line (markdown emphasis cannot span
 *   paragraphs).
 */
export function toggleInlineWrap(doc: string, rawSelection: TextSelection, marker: InlineMarker): TextEdit {
  const { from, to } = normalize(doc, rawSelection);
  const char = marker.charAt(0);
  const size = marker.length;
  const before = runBefore(doc, from, char);
  const after = runAfter(doc, to, char);

  if (from === to) {
    if (before >= size && after >= size && runHasMarker(before, marker) && runHasMarker(after, marker)) {
      return {
        from: from - size,
        to: to + size,
        insert: '',
        selection: { from: from - size, to: from - size },
      };
    }
    return { from, to, insert: marker + marker, selection: { from: from + size, to: from + size } };
  }

  const selected = doc.slice(from, to);
  if (!selected.includes('\n') && runHasMarker(before, marker) && runHasMarker(after, marker)) {
    return {
      from: from - size,
      to: to + size,
      insert: selected,
      selection: { from: from - size, to: to - size },
    };
  }

  const lines = selected.split('\n');
  const contentLines = lines.filter((line) => line.trim() !== '');
  const unwrap = contentLines.length > 0 && contentLines.every((line) => segmentIsWrapped(line, marker));
  const insert = lines
    .map((line) => {
      if (line.trim() === '') return line;
      return unwrap ? unwrapSegment(line, marker) : wrapSegment(line, marker);
    })
    .join('\n');
  if (insert === selected) return { from, to, insert, selection: { from, to } };
  if (!unwrap && lines.length === 1) {
    const [leading, core] = splitWhitespace(selected);
    const start = from + leading.length + size;
    return { from, to, insert, selection: { from: start, to: start + core.length } };
  }
  return { from, to, insert, selection: { from, to: from + insert.length } };
}

/**
 * Inserts a link. The selected text becomes the link text and the URL
 * placeholder is selected; a selected URL becomes the target and the caret is
 * placed in the (empty) link text.
 */
export function insertLink(doc: string, rawSelection: TextSelection): TextEdit {
  const { from, to } = normalize(doc, rawSelection);
  const selected = doc.slice(from, to);
  if (/^(?:https?:\/\/|mailto:)\S+$/i.test(selected.trim())) {
    const insert = `[](${selected.trim()})`;
    return { from, to, insert, selection: { from: from + 1, to: from + 1 } };
  }
  const text = selected.replace(/\n+/g, ' ');
  const insert = `[${text}](${LINK_URL_PLACEHOLDER})`;
  const urlStart = from + text.length + 3;
  return { from, to, insert, selection: { from: urlStart, to: urlStart + LINK_URL_PLACEHOLDER.length } };
}

interface LineBlock {
  readonly start: number;
  readonly end: number;
  readonly lines: string[];
}

function selectedLines(doc: string, selection: TextSelection): LineBlock {
  const start = lineStartAt(doc, selection.from);
  // A selection ending at the very start of a line does not include that line.
  const endPos =
    selection.to > selection.from && doc.charAt(selection.to - 1) === '\n' ? selection.to - 1 : selection.to;
  const end = lineEndAt(doc, Math.max(endPos, start));
  return { start, end, lines: doc.slice(start, end).split('\n') };
}

/**
 * Builds the edit for a per-line rewrite. A caret keeps its place in the text
 * (shifted by the prefix change of its line); a range selection covers the
 * rewritten lines so that a repeated command applies to the same lines again.
 */
function lineEdit(block: LineBlock, selection: TextSelection, rewritten: string[]): TextEdit {
  const insert = rewritten.join('\n');
  if (selection.from !== selection.to) {
    return {
      from: block.start,
      to: block.end,
      insert,
      selection: { from: block.start, to: block.start + insert.length },
    };
  }
  // A caret selects exactly one line, so the whole length change is the shift of its prefix.
  const firstDelta = insert.length - (block.end - block.start);
  const caret = Math.min(block.start + insert.length, Math.max(block.start, selection.from + firstDelta));
  return { from: block.start, to: block.end, insert, selection: { from: caret, to: caret } };
}

const CONTAINER_PREFIX = /^((?:[ \t]*>[ \t]?)*)/;
const HEADING_PREFIX = /^[ \t]{0,3}(#{1,6})(?:[ \t]+|$)/;

function splitContainer(line: string): [prefix: string, rest: string] {
  const prefix = line.length - line.replace(CONTAINER_PREFIX, '').length;
  return [line.slice(0, prefix), line.slice(prefix)];
}

/**
 * Sets the heading level (1–6) of the selected lines, or turns them into plain
 * paragraphs with level 0. Applying the level every line already has removes
 * it (toggle). Block-quote prefixes are preserved.
 */
export function setHeadingLevel(
  doc: string,
  rawSelection: TextSelection,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): TextEdit {
  const selection = normalize(doc, rawSelection);
  const block = selectedLines(doc, selection);
  const parsed = block.lines.map((line) => {
    const [prefix, rest] = splitContainer(line);
    const match = HEADING_PREFIX.exec(rest);
    return {
      prefix,
      original: line,
      level: match === null ? 0 : match[0].trim().length,
      text: match === null ? rest : rest.slice(match[0].length),
    };
  });
  const content = parsed.filter((line) => line.text.trim() !== '' || line.level > 0);
  const toggleOff = level > 0 && content.length > 0 && content.every((line) => line.level === level);
  const target = toggleOff ? 0 : level;
  const rewritten = parsed.map((line) => {
    if (line.text.trim() === '' && line.level === 0 && block.lines.length > 1) return line.original;
    const text = line.level === 0 ? line.text.replace(/^[ \t]{0,3}/, '') : line.text;
    return target === 0 ? `${line.prefix}${text}` : `${line.prefix}${'#'.repeat(target)} ${text}`;
  });
  return lineEdit(block, selection, rewritten);
}

const LIST_PREFIX =
  /^([ \t]*)(?:([-*+])[ \t]+\[[ xX]\](?:[ \t]+|$)|([-*+])(?:[ \t]+|$)|(\d{1,9})([.)])(?:[ \t]+|$))/;

interface ListLine {
  readonly indent: string;
  readonly kind: LineListKind | null;
  readonly text: string;
  readonly original: string;
}

function parseListLine(line: string): ListLine {
  const match = LIST_PREFIX.exec(line);
  if (match === null) {
    const text = line.replace(/^[ \t]*/, '');
    return { indent: line.slice(0, line.length - text.length), kind: null, text, original: line };
  }
  const indent = line.slice(0, line.length - line.trimStart().length);
  const kind: LineListKind = match[2] !== undefined ? 'task' : match[3] !== undefined ? 'bullet' : 'ordered';
  return { indent, kind, text: line.slice(match[0].length), original: line };
}

/**
 * Toggles a list type on the selected lines: lines that already all have the
 * requested kind lose their marker; otherwise every non-blank line gets it,
 * replacing any other list marker. Ordered lists are numbered from 1.
 */
export function toggleListPrefix(doc: string, rawSelection: TextSelection, kind: LineListKind): TextEdit {
  const selection = normalize(doc, rawSelection);
  const block = selectedLines(doc, selection);
  const parsed = block.lines.map(parseListLine);
  const allBlank = block.lines.every((line) => line.trim() === '');
  const targets = parsed.filter((line) => allBlank || line.original.trim() !== '');
  const remove = !allBlank && targets.every((line) => line.kind === kind);
  let number = 0;
  const rewritten = parsed.map((line) => {
    if (!allBlank && line.original.trim() === '') return line.original;
    if (remove) return `${line.indent}${line.text}`;
    number += 1;
    const marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${number}. `;
    return `${line.indent}${marker}${line.text}`;
  });
  return lineEdit(block, selection, rewritten);
}

/** Adds `> ` to the selected lines, or removes one quote level when all of them are quoted. */
export function toggleBlockquote(doc: string, rawSelection: TextSelection): TextEdit {
  const selection = normalize(doc, rawSelection);
  const block = selectedLines(doc, selection);
  const content = block.lines.filter((line) => line.trim() !== '');
  const remove = content.length > 0 && content.every((line) => /^[ \t]{0,3}>/.test(line));
  const rewritten = block.lines.map((line) => {
    if (remove) return line.replace(/^([ \t]{0,3})>[ \t]?/, '$1');
    return line.trim() === '' ? '>' : `> ${line}`;
  });
  return lineEdit(block, selection, rewritten);
}

/** A complete fenced block: opening fence line, optional content, closing fence line. */
const FENCED_BLOCK = /^[ \t]{0,3}(?:`{3,}|~{3,})[^\n]*\n(?:([\s\S]*)\n)?[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*$/;

/**
 * Wraps the selected lines in a fenced code block (the fence is longer than
 * any backtick run inside), or removes the fences when the selection is
 * exactly one fenced block. With an empty selection on an empty line an empty
 * block is inserted and the caret placed inside.
 */
export function toggleCodeBlock(doc: string, rawSelection: TextSelection): TextEdit {
  const selection = normalize(doc, rawSelection);
  const block = selectedLines(doc, selection);
  const content = block.lines.join('\n');
  const fenced = FENCED_BLOCK.exec(content);
  if (fenced !== null) {
    const inner = fenced[1] ?? '';
    return {
      from: block.start,
      to: block.end,
      insert: inner,
      selection: { from: block.start, to: block.start + inner.length },
    };
  }
  const longestRun = Math.max(2, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
  const fence = '`'.repeat(longestRun + 1);
  const insert = `${fence}\n${content}\n${fence}`;
  const innerStart = block.start + fence.length + 1;
  return {
    from: block.start,
    to: block.end,
    insert,
    selection: { from: innerStart, to: innerStart + content.length },
  };
}

/**
 * Inserts a block (table, rule) as its own paragraph after the line containing
 * the selection end, separated by blank lines so it cannot merge with
 * surrounding text (e.g. `---` under text would become a setext heading).
 */
function insertBlock(
  doc: string,
  rawSelection: TextSelection,
  text: string,
  select: TextSelection,
): TextEdit {
  const selection = normalize(doc, rawSelection);
  const lineStart = lineStartAt(doc, selection.to);
  const lineEnd = lineEndAt(doc, selection.to);
  const currentLineBlank = doc.slice(lineStart, lineEnd).trim() === '';
  const at = currentLineBlank ? lineStart : lineEnd;
  const textBefore = doc.slice(0, at);
  const textAfter = doc.slice(lineEnd);
  let prefix = '';
  if (!currentLineBlank) prefix = '\n\n';
  else if (textBefore !== '' && !textBefore.endsWith('\n\n')) prefix = '\n';
  let suffix = '';
  if (textAfter === '') suffix = '\n';
  // `textAfter` starts at a line end, so it is either empty or starts with a newline.
  else if (!textAfter.startsWith('\n\n')) suffix = '\n';
  const insert = `${prefix}${text}${suffix}`;
  const base = at + prefix.length;
  return { from: at, to: lineEnd, insert, selection: { from: base + select.from, to: base + select.to } };
}

const TABLE_TEMPLATE = [
  '| Column 1 | Column 2 | Column 3 |',
  '| -------- | -------- | -------- |',
  '|          |          |          |',
  '|          |          |          |',
].join('\n');

/** Inserts a 3-column table (header + 2 rows) and selects the first header cell. */
export function insertTable(doc: string, selection: TextSelection): TextEdit {
  return insertBlock(doc, selection, TABLE_TEMPLATE, { from: 2, to: 10 });
}

/** Inserts a thematic break (`---`) on its own line and places the caret after it. */
export function insertHorizontalRule(doc: string, selection: TextSelection): TextEdit {
  const edit = insertBlock(doc, selection, '---', { from: 3, to: 3 });
  const caret = Math.min(edit.from + edit.insert.length, edit.selection.to + 1);
  return { ...edit, selection: { from: caret, to: caret } };
}

/** Dispatches a {@link FormatCommand} to the matching text transformation. */
export function applyFormatCommand(doc: string, selection: TextSelection, command: FormatCommand): TextEdit {
  switch (command) {
    case 'bold':
      return toggleInlineWrap(doc, selection, '**');
    case 'italic':
      return toggleInlineWrap(doc, selection, '*');
    case 'strikethrough':
      return toggleInlineWrap(doc, selection, '~~');
    case 'inlineCode':
      return toggleInlineWrap(doc, selection, '`');
    case 'link':
      return insertLink(doc, selection);
    case 'heading1':
      return setHeadingLevel(doc, selection, 1);
    case 'heading2':
      return setHeadingLevel(doc, selection, 2);
    case 'heading3':
      return setHeadingLevel(doc, selection, 3);
    case 'paragraph':
      return setHeadingLevel(doc, selection, 0);
    case 'bulletList':
      return toggleListPrefix(doc, selection, 'bullet');
    case 'orderedList':
      return toggleListPrefix(doc, selection, 'ordered');
    case 'taskList':
      return toggleListPrefix(doc, selection, 'task');
    case 'blockquote':
      return toggleBlockquote(doc, selection);
    case 'codeBlock':
      return toggleCodeBlock(doc, selection);
    case 'table':
      return insertTable(doc, selection);
    case 'horizontalRule':
      return insertHorizontalRule(doc, selection);
  }
}
