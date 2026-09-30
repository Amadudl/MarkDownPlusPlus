/**
 * Pure, dependency-free helpers that analyse a markdown string. They are used by
 * the outline panel, the status bar and the source editor (`scrollToHeading`).
 */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface MarkdownHeading {
  readonly level: HeadingLevel;
  /** Heading text with inline markdown syntax removed. */
  readonly text: string;
  /** 1-based line of the heading (first line of the paragraph for setext headings). */
  readonly line: number;
}

export interface DocumentStats {
  readonly words: number;
  /** User-perceived characters (grapheme clusters), including whitespace. */
  readonly characters: number;
  readonly charactersNoSpaces: number;
  /** Number of lines; an empty document has one (empty) line, like every editor shows. */
  readonly lines: number;
  /** Estimated reading time at 230 words per minute; at least 1 for a non-empty document. */
  readonly readingMinutes: number;
}

/** Average adult silent reading speed used for {@link DocumentStats.readingMinutes}. */
export const WORDS_PER_MINUTE = 230;

const LINE_BREAK = /\r\n|\r|\n/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const ATX_CLOSING_SEQUENCE = /(?:^|[ \t]+)#+$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const LIST_ITEM = /^( {0,3})([-*+]|(\d{1,9})[.)])(?=[ \t]|$)([ \t]*)(.*)$/;
const BLOCKQUOTE = /^ {0,3}>/;
const INDENTED_CODE = /^(?: {4}|\t)/;
const FRONT_MATTER_OPEN = /^---[ \t]*$/;
const FRONT_MATTER_CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const BLANK = /^[ \t]*$/;

/** A capture group of a match; optional groups that did not participate yield ''. */
function group(match: RegExpExecArray, index: number): string {
  return match[index] ?? '';
}

interface Fence {
  readonly char: string;
  readonly length: number;
}

/** Returns the fence opened by `line`, or null. Backtick fences may not contain backticks in the info string. */
function openFence(line: string): Fence | null {
  const match = FENCE_OPEN.exec(line);
  if (match === null) return null;
  const marker = group(match, 1);
  const info = group(match, 2);
  if (marker.startsWith('`') && info.includes('`')) return null;
  return { char: marker.charAt(0), length: marker.length };
}

function closesFence(line: string, fence: Fence): boolean {
  const trimmed = line.replace(/^ {0,3}/, '').trimEnd();
  if (trimmed.length < fence.length) return false;
  for (const char of trimmed) if (char !== fence.char) return false;
  return true;
}

/** Index of the first line after YAML front matter, or 0 when the document has none. */
function skipFrontMatter(lines: readonly string[]): number {
  for (const [index, line] of lines.entries()) {
    if (index === 0) {
      if (!FRONT_MATTER_OPEN.test(line)) return 0;
    } else if (FRONT_MATTER_CLOSE.test(line)) {
      return index + 1;
    }
  }
  return 0;
}

/** A markdown document split into its YAML front matter and the markdown body after it. */
export interface FrontMatterSplit {
  /**
   * The front matter verbatim: the opening `---` line through the closing `---`
   * (or `...`) line, including its line break and any blank lines that follow.
   * Empty when the document has no front matter.
   */
  readonly frontMatter: string;
  /** Everything after {@link FrontMatterSplit.frontMatter}. */
  readonly body: string;
}

/**
 * Splits leading YAML front matter (`---` … `---`, as used by Jekyll, Hugo,
 * Obsidian, …) off a markdown document. The front matter must start on the
 * first line and be closed; otherwise the whole document is the body.
 * `frontMatter + body` always equals the input.
 */
export function splitFrontMatter(markdown: string): FrontMatterSplit {
  const none: FrontMatterSplit = { frontMatter: '', body: markdown };
  let end = -1;
  let first = true;
  for (const line of linesWithOffsets(markdown)) {
    if (first) {
      if (!FRONT_MATTER_OPEN.test(line.text)) return none;
      first = false;
    } else if (end < 0) {
      if (FRONT_MATTER_CLOSE.test(line.text)) end = line.next;
    } else if (BLANK.test(line.text)) {
      // Blank lines after the closing fence stay with the front matter (Visual mode drops leading blanks).
      end = line.next;
    } else {
      break;
    }
  }
  return end < 0 ? none : { frontMatter: markdown.slice(0, end), body: markdown.slice(end) };
}

/** Lines of `text` with the offset just after each line's break (or the end of the text). */
function* linesWithOffsets(text: string): Generator<{ readonly text: string; readonly next: number }> {
  const lineBreak = /\r\n|\r|\n/g;
  let start = 0;
  for (let match = lineBreak.exec(text); match !== null; match = lineBreak.exec(text)) {
    const next = match.index + match[0].length;
    yield { text: text.slice(start, match.index), next };
    start = next;
  }
  if (start < text.length) yield { text: text.slice(start), next: text.length };
}

/** Width of the leading whitespace of `text` starting at `column`; tabs advance to the next multiple of 4. */
function whitespaceWidth(text: string, column = 0): number {
  let width = column;
  for (const char of text) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4 - (width % 4);
    else break;
  }
  return width - column;
}

/** A list item that starts on `line`, or null. */
interface ListItemStart {
  /** Column at which the item's content starts; lines indented at least this far belong to the item. */
  readonly contentIndent: number;
  readonly empty: boolean;
  /** The ordinal of an ordered list item, null for bullets. */
  readonly ordinal: number | null;
}

function listItemStart(line: string): ListItemStart | null {
  if (THEMATIC_BREAK.test(line)) return null;
  const match = LIST_ITEM.exec(line);
  if (match === null) return null;
  const markerStart = group(match, 1).length;
  const markerEnd = markerStart + group(match, 2).length;
  const spacing = whitespaceWidth(group(match, 4), markerEnd);
  const empty = BLANK.test(group(match, 5));
  // An empty item or content indented by 5+ columns (indented code) starts one column after the marker.
  const contentIndent = empty || spacing > 4 ? markerEnd + 1 : markerEnd + spacing;
  const digits = match[3];
  return { contentIndent, empty, ordinal: digits === undefined ? null : Number(digits) };
}

const HTML_BLOCK_TYPE_6_TAGS =
  'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const HTML_BLOCK_STARTS: readonly { readonly start: RegExp; readonly end: RegExp | null }[] = [
  { start: /^ {0,3}<(?:script|pre|style|textarea)(?:[\s>]|$)/i, end: /<\/(?:script|pre|style|textarea)>/i },
  { start: /^ {0,3}<!--/, end: /-->/ },
  { start: /^ {0,3}<\?/, end: /\?>/ },
  { start: /^ {0,3}<![A-Za-z]/, end: />/ },
  { start: /^ {0,3}<!\[CDATA\[/, end: /\]\]>/ },
  { start: new RegExp(`^ {0,3}</?(?:${HTML_BLOCK_TYPE_6_TAGS})(?:[\\s>]|/>|$)`, 'i'), end: null },
];
/** HTML block type 7: a lone complete open or closing tag. It cannot interrupt a paragraph. */
const HTML_BLOCK_TYPE_7 =
  /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)[ \t]*$/;

/** An HTML block starting on a line. */
interface HtmlBlockStart {
  /** Pattern of the line that closes the block (part of the block), or null when a blank line ends it. */
  readonly end: RegExp | null;
  /** True when the closing pattern already occurs on the first line after the opening token. */
  readonly closed: boolean;
}

/**
 * The HTML block (CommonMark types 1–7) that starts on `line`, or undefined
 * when none does. Type 7 blocks cannot interrupt a paragraph.
 */
function htmlBlockStart(line: string, inParagraph: boolean): HtmlBlockStart | undefined {
  for (const kind of HTML_BLOCK_STARTS) {
    const match = kind.start.exec(line);
    if (match === null) continue;
    const rest = line.slice(match[0].length);
    return { end: kind.end, closed: kind.end?.test(rest) === true };
  }
  if (!inParagraph && HTML_BLOCK_TYPE_7.test(line)) return { end: null, closed: false };
  return undefined;
}

/** True when `line` starts a block that interrupts a (lazy) paragraph continuation. */
function interruptsParagraph(line: string): boolean {
  if (BLANK.test(line) || THEMATIC_BREAK.test(line) || ATX_HEADING.test(line) || BLOCKQUOTE.test(line)) {
    return true;
  }
  if (openFence(line) !== null || htmlBlockStart(line, true) !== undefined) return true;
  const item = listItemStart(line);
  return item !== null && !item.empty && (item.ordinal === null || item.ordinal === 1);
}

/**
 * Removes inline markdown syntax so that a heading can be displayed as plain
 * text: images and links keep their text, emphasis/code/strike markers and
 * inline HTML tags are dropped and backslash escapes are resolved.
 */
export function stripInlineMarkdown(text: string): string {
  // Escaped characters are parked in private-use placeholders so they are not mistaken for syntax.
  const protectedText = text.replace(
    /\\([!-/:-@[-`{-~])/g,
    (_match, char: string) => `\uE000${char.charCodeAt(0)}\uE001`,
  );
  return protectedText
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/(\*{1,3}|_{1,3}|~~|`+)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/\uE000(\d+)\uE001/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the top-level ATX (`# Title`) and setext (`Title` + `===`/`---`)
 * headings of a markdown document in document order. Fenced code blocks,
 * indented code blocks, HTML blocks, YAML front matter and headings nested in
 * containers (block quotes, list items including their indented continuation
 * lines) are ignored, which mirrors the top-level heading nodes of the WYSIWYG
 * document (see `scrollToTopLevelHeading`).
 */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.split(LINE_BREAK);
  const headings: MarkdownHeading[] = [];
  let fence: Fence | null = null;
  /** The open HTML block, if any. */
  let html: HtmlBlockStart | null = null;
  /** Content column of the open list item, or null outside of lists. */
  let listIndent: number | null = null;
  /** True while the last line of the open list item was paragraph text (enables lazy continuation). */
  let listParagraph = false;
  /** Lines of the paragraph currently being read (a setext heading candidate). */
  let paragraph: string[] = [];
  let paragraphStart = 0;

  const start = skipFrontMatter(lines);
  for (const [index, line] of lines.entries()) {
    if (index < start) continue;

    if (fence !== null) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    if (html !== null) {
      if (html.end === null ? BLANK.test(line) : html.end.test(line)) html = null;
      continue;
    }

    if (listIndent !== null) {
      if (BLANK.test(line)) {
        listParagraph = false;
        paragraph = [];
        continue;
      }
      if (whitespaceWidth(line) >= listIndent || (listParagraph && !interruptsParagraph(line))) {
        listParagraph = true;
        continue;
      }
      listIndent = null;
      listParagraph = false;
    }

    const setext = paragraph.length > 0 ? SETEXT_UNDERLINE.exec(line) : null;
    if (setext !== null) {
      const text = stripInlineMarkdown(paragraph.join(' '));
      if (text !== '') {
        headings.push({ level: group(setext, 1).startsWith('=') ? 1 : 2, text, line: paragraphStart + 1 });
      }
      paragraph = [];
      continue;
    }

    const opened = openFence(line);
    if (opened !== null) {
      fence = opened;
      paragraph = [];
      continue;
    }

    const atx = ATX_HEADING.exec(line);
    if (atx !== null) {
      const raw = group(atx, 2).replace(ATX_CLOSING_SEQUENCE, '');
      headings.push({
        level: group(atx, 1).length as HeadingLevel,
        text: stripInlineMarkdown(raw),
        line: index + 1,
      });
      paragraph = [];
      continue;
    }

    const htmlBlock = htmlBlockStart(line, paragraph.length > 0);
    if (htmlBlock !== undefined) {
      // Types 1-5 may close on their first line (e.g. `<!-- note -->`).
      html = htmlBlock.closed ? null : htmlBlock;
      paragraph = [];
      continue;
    }

    const item = listItemStart(line);
    // Only non-empty bullets and ordered items starting at 1 may interrupt a paragraph.
    if (item !== null && (paragraph.length === 0 || interruptsParagraph(line))) {
      listIndent = item.contentIndent;
      listParagraph = !item.empty;
      paragraph = [];
      continue;
    }

    if (
      BLANK.test(line) ||
      THEMATIC_BREAK.test(line) ||
      BLOCKQUOTE.test(line) ||
      (paragraph.length === 0 && INDENTED_CODE.test(line))
    ) {
      paragraph = [];
      continue;
    }

    if (paragraph.length === 0) paragraphStart = index;
    paragraph.push(line.trim());
  }
  return headings;
}

const WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}\p{M}])+(?:['’-](?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}\p{M}])+)*/gu;

/** Removes markdown syntax that must not be counted as words (URLs, fences, markers, tags). */
function stripSyntaxForCounting(markdown: string): string {
  return markdown
    .split(LINE_BREAK)
    .filter((line) => openFence(line) === null && !/^ {0,3}(?:`{3,}|~{3,})[ \t]*$/.test(line))
    .filter((line) => !THEMATIC_BREAK.test(line) && !SETEXT_UNDERLINE.test(line))
    .filter((line) => !/^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(line))
    .join('\n')
    .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}\[[^\]]+\]:.*$/gm, '')
    .replace(/<(?:https?|mailto|ftp):[^>\s]*>/gi, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ');
}

/** Counts words: runs of letters/digits (with inner apostrophes or hyphens); each CJK ideograph or kana is one word. */
export function countWords(markdown: string): number {
  const text = stripSyntaxForCounting(markdown);
  return Array.from(text.matchAll(WORD)).length;
}

let graphemeSegmenter: Intl.Segmenter | null = null;

function graphemes(text: string): string[] {
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

/** Word, character, line and reading-time statistics of a markdown document. */
export function documentStats(markdown: string): DocumentStats {
  const clusters = graphemes(markdown);
  let nonSpace = 0;
  for (const cluster of clusters) if (!/^\s+$/u.test(cluster)) nonSpace += 1;
  const words = countWords(markdown);
  const readingMinutes = markdown.trim() === '' ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return {
    words,
    characters: clusters.length,
    charactersNoSpaces: nonSpace,
    lines: markdown.split(LINE_BREAK).length,
    readingMinutes,
  };
}
