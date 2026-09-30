import { splitFrontMatter } from '@renderer/editor/markdown-utils';

/** Syntax of a front matter block: YAML (`---` fences) or TOML (`+++` fences). */
export type FrontMatterFormat = 'yaml' | 'toml';

/** Leading metadata of a markdown document, as found by {@link splitExportFrontMatter}. */
export interface ExportFrontMatter {
  readonly format: FrontMatterFormat;
  /** The lines between the opening and the closing fence, joined with `\n`. */
  readonly content: string;
}

/** A markdown document split into its front matter (if any) and the markdown body after it. */
export interface ExportFrontMatterSplit {
  /** The front matter, or null when the document has none. */
  readonly frontMatter: ExportFrontMatter | null;
  /** The markdown that is rendered; the whole document when it has no front matter. */
  readonly body: string;
}

const LINE_BREAK = /\r\n|\r|\n/;
const TOML_FENCE = /^\+\+\+[ \t]*$/;
const TRAILING_BLANK_LINES = /(?:\r\n|\r|\n)[ \t\r\n]*$/;

/** The lines strictly between the opening and the closing fence of `block`, joined with `\n`. */
function fencedContent(block: string): string {
  return block.replace(TRAILING_BLANK_LINES, '').split(LINE_BREAK).slice(1, -1).join('\n');
}

/**
 * Splits TOML front matter (`+++` … `+++`, as used by Hugo and Zola) off `markdown`.
 * Returns the fenced block (closing fence line and its line break included), or null
 * when the first line is not a `+++` fence or the block is never closed.
 */
function splitTomlBlock(markdown: string): string | null {
  const lineBreak = /\r\n|\r|\n/g;
  let start = 0;
  for (;;) {
    const match = lineBreak.exec(markdown);
    const end = match === null ? markdown.length : match.index;
    const next = match === null ? markdown.length : match.index + match[0].length;
    const isFence = TOML_FENCE.test(markdown.slice(start, end));
    if (start === 0 && !isFence) return null;
    if (start > 0 && isFence) return markdown.slice(0, next);
    if (match === null) return null;
    start = next;
  }
}

/**
 * Splits leading front matter off a markdown document for export, so that it is not
 * rendered as content (CommonMark would turn a YAML block into a thematic break plus a
 * setext heading, and a TOML block into a paragraph).
 *
 * - YAML: `---` … `---` (or `...`), detected exactly like the editor does
 *   ({@link splitFrontMatter}), so Visual mode and export agree on what is front matter.
 * - TOML: `+++` … `+++`.
 *
 * The opening fence must be the very first line (a byte order mark must already be
 * stripped, as the main process does when reading files) and the block must be closed;
 * otherwise the whole document is the body. Line endings may be LF, CRLF or CR.
 */
export function splitExportFrontMatter(markdown: string): ExportFrontMatterSplit {
  const yaml = splitFrontMatter(markdown);
  if (yaml.frontMatter !== '') {
    return { frontMatter: { format: 'yaml', content: fencedContent(yaml.frontMatter) }, body: yaml.body };
  }
  const toml = splitTomlBlock(markdown);
  if (toml === null) return { frontMatter: null, body: markdown };
  return { frontMatter: { format: 'toml', content: fencedContent(toml) }, body: markdown.slice(toml.length) };
}

const YAML_TITLE = /^title[ \t]*:(?:[ \t]+(.*))?$/;
const TOML_TITLE = /^[ \t]*title[ \t]*=[ \t]*(.*)$/;
const TOML_TABLE = /^[ \t]*\[/;
/** YAML indicators that start something other than a plain one-line scalar (block scalars, collections, anchors, ...). */
const YAML_NON_PLAIN = /^[|>[{&*!%@`]/;

/** Parses a double-quoted string (`"..."` with JSON-compatible escapes) followed only by an optional comment. */
function parseDoubleQuoted(value: string): string | null {
  const match = /^("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/.exec(value);
  if (match?.[1] === undefined) return null;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

/** Parses a single-quoted string followed only by an optional comment; `''` is an escaped quote in YAML. */
function parseSingleQuoted(value: string, format: FrontMatterFormat): string | null {
  const pattern = format === 'yaml' ? /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/ : /^'([^']*)'[ \t]*(?:#.*)?$/;
  const match = pattern.exec(value);
  if (match?.[1] === undefined) return null;
  return format === 'yaml' ? match[1].replace(/''/g, "'") : match[1];
}

/** Parses the raw value of a `title` entry; null for anything but a one-line string. */
function parseTitleValue(raw: string, format: FrontMatterFormat): string | null {
  const value = raw.trim();
  if (value.startsWith('"')) return parseDoubleQuoted(value);
  if (value.startsWith("'")) return parseSingleQuoted(value, format);
  // TOML strings are always quoted; YAML plain scalars end before a ` #` comment.
  if (format === 'toml' || YAML_NON_PLAIN.test(value)) return null;
  return value.replace(/[ \t]+#.*$/, '');
}

/**
 * The document title declared in front matter: the first top-level `title` entry whose
 * value is a one-line string (YAML plain, single- or double-quoted scalar; TOML basic or
 * literal string before the first `[table]`). Returns null when there is no such entry
 * or its value is blank, multi-line, or not a string. The result is plain text; callers
 * must escape it before embedding it in HTML.
 */
export function frontMatterTitle(frontMatter: ExportFrontMatter): string | null {
  for (const line of frontMatter.content.split('\n')) {
    if (frontMatter.format === 'toml' && TOML_TABLE.test(line)) return null;
    const match = (frontMatter.format === 'yaml' ? YAML_TITLE : TOML_TITLE).exec(line);
    if (match === null) continue;
    const title = parseTitleValue(match[1] ?? '', frontMatter.format)?.trim() ?? '';
    return title === '' ? null : title;
  }
  return null;
}
