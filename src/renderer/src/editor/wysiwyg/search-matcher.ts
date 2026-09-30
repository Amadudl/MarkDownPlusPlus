import type { SearchQuery } from '../types';

/**
 * Pure, DOM-free matching logic of the WYSIWYG find & replace. It turns a
 * {@link SearchQuery} into a regular expression and finds matches in plain
 * strings; the ProseMirror plugin maps the string offsets to document positions.
 */

/** Hard cap on the number of matches, protecting the UI from pathological queries. */
export const MAX_SEARCH_MATCHES = 10_000;

/** Characters that count as part of a word for whole-word matching. */
const WORD_CHAR = String.raw`[\p{L}\p{N}\p{M}_]`;

export interface CompiledSearch {
  /** Global, unicode-aware expression (never executed statefully, so it can be shared). */
  readonly regexp: RegExp;
  /** True when the user typed a regular expression (enables `$1`-style replacement templates). */
  readonly isRegexp: boolean;
}

export type CompileResult =
  | { readonly ok: true; readonly search: CompiledSearch | null }
  | { readonly ok: false; readonly error: string };

export interface TextMatch {
  /** Start offset (inclusive) in the searched string. */
  readonly from: number;
  /** End offset (exclusive) in the searched string. */
  readonly to: number;
  /** `captures[0]` is the full match, followed by the numbered groups. */
  readonly captures: readonly (string | undefined)[];
  readonly groups: Readonly<Record<string, string | undefined>> | undefined;
}

/** Escapes every character with a special meaning in a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Shown for regular expressions rejected by {@link hasNestedQuantifier}. */
export const NESTED_QUANTIFIER_ERROR =
  'Nested repetition such as (a+)+ is not supported: it can make the search freeze the editor';

/** Repetition bounds of a quantifier token. */
interface Quantifier {
  /** Number of characters of the token (including a lazy `?` suffix). */
  readonly length: number;
  /** True when the count can vary and exceed one (`*`, `+`, `{n,}`, `{n,m}` with m > n, m > 1). */
  readonly variable: boolean;
  /** True when the element may repeat more than once. */
  readonly repeats: boolean;
}

const BRACE_QUANTIFIER = /^\{(\d+)(,(\d*))?\}/;

/** Reads the quantifier at `index` of a regular expression source, or null. */
function readQuantifier(source: string, index: number): Quantifier | null {
  const char = source.charAt(index);
  let quantifier: Quantifier | null = null;
  if (char === '*' || char === '+') quantifier = { length: 1, variable: true, repeats: true };
  else if (char === '?') quantifier = { length: 1, variable: false, repeats: false };
  else if (char === '{') {
    const match = BRACE_QUANTIFIER.exec(source.slice(index));
    if (match === null) return null;
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[3] === '' ? Infinity : Number(match[3]);
    quantifier = { length: match[0].length, variable: max > min && max > 1, repeats: max > 1 };
  }
  if (quantifier === null) return null;
  return source.charAt(index + quantifier.length) === '?'
    ? { ...quantifier, length: quantifier.length + 1 }
    : quantifier;
}

/** Index just after the group prefix (`?:`, `?=`, `?!`, `?<=`, `?<!`, `?<name>`, `?i:`) at `index`. */
function skipGroupPrefix(source: string, index: number): number {
  if (source.charAt(index) !== '?') return index;
  const next = source.charAt(index + 1);
  if (next === ':' || next === '=' || next === '!') return index + 2;
  if (next === '<') {
    const after = source.charAt(index + 2);
    if (after === '=' || after === '!') return index + 3;
    const close = source.indexOf('>', index + 2);
    return close === -1 ? source.length : close + 1;
  }
  const colon = source.indexOf(':', index + 1);
  return colon === -1 ? source.length : colon + 1;
}

/** Index just after the character class that starts at `index` (`[` … `]`, honouring escapes). */
function skipCharacterClass(source: string, index: number): number {
  let position = index + 1;
  while (position < source.length) {
    const char = source.charAt(position);
    if (char === '\\') position += 2;
    else if (char === ']') return position + 1;
    else position += 1;
  }
  return source.length;
}

/**
 * True when a regular expression repeats a group that itself contains a
 * variable-length repetition, e.g. `(a+)+`, `(?:\w*x)*` or `(a|b+){2,}`. Such
 * patterns can backtrack exponentially: `(a+)+$` against a long run of `a`
 * followed by `b` never finishes. Search runs synchronously on the renderer's
 * main thread in both editors, so these patterns are rejected up front.
 */
export function hasNestedQuantifier(source: string): boolean {
  /** For each open group: whether the enclosing group already contained a variable repetition. */
  const outer: boolean[] = [];
  let variableInside = false;
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    let atomVariable = false;
    if (char === '(') {
      outer.push(variableInside);
      variableInside = false;
      index = skipGroupPrefix(source, index + 1);
      continue;
    }
    if (char === ')') {
      const inner: boolean = variableInside;
      variableInside = outer.pop() ?? false;
      index += 1;
      const quantifier = readQuantifier(source, index);
      if (quantifier !== null) {
        if (inner && quantifier.repeats) return true;
        index += quantifier.length;
        atomVariable = quantifier.variable;
      }
      variableInside ||= inner || atomVariable;
      continue;
    }
    if (char === '\\') index += 2;
    else if (char === '[') index = skipCharacterClass(source, index);
    else index += 1;
    const quantifier = readQuantifier(source, index);
    if (quantifier !== null) {
      index += quantifier.length;
      atomVariable = quantifier.variable;
    }
    variableInside ||= atomVariable;
  }
  return false;
}

/**
 * Compiles a query. An empty query yields `{ ok: true, search: null }`; an
 * invalid regular expression yields `{ ok: false, error }` with the engine's
 * message so the find bar can display it, and a pattern with nested
 * repetition yields {@link NESTED_QUANTIFIER_ERROR}.
 */
export function compileSearchQuery(query: SearchQuery): CompileResult {
  if (query.text === '') return { ok: true, search: null };
  const source = query.regexp ? query.text : escapeRegExp(query.text);
  const bounded = query.wholeWord ? `(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})` : source;
  const flags = query.caseSensitive ? 'gu' : 'giu';
  let regexp: RegExp;
  try {
    regexp = new RegExp(bounded, flags);
  } catch (error) {
    // The RegExp constructor only ever throws a SyntaxError.
    return { ok: false, error: (error as SyntaxError).message };
  }
  if (query.regexp && hasNestedQuantifier(query.text)) return { ok: false, error: NESTED_QUANTIFIER_ERROR };
  return { ok: true, search: { regexp, isRegexp: query.regexp } };
}

/**
 * Finds up to `limit` non-empty matches in `text`. Zero-length matches (for
 * example of `a*` or `^`) are skipped so navigation always has something to
 * select and the scan can never loop forever.
 */
export function findTextMatches(
  text: string,
  search: CompiledSearch,
  limit = MAX_SEARCH_MATCHES,
): TextMatch[] {
  const matches: TextMatch[] = [];
  if (limit <= 0) return matches;
  // `matchAll` works on a copy of the expression and advances past empty matches by code point.
  for (const result of text.matchAll(search.regexp)) {
    const matched = result[0];
    if (matched === '') continue;
    matches.push({
      from: result.index,
      to: result.index + matched.length,
      captures: Array.from(result),
      groups: result.groups,
    });
    if (matches.length >= limit) break;
  }
  return matches;
}

/**
 * Expands a replacement template for a match. Plain-text searches insert the
 * replacement literally; regular-expression searches support `$&` (whole
 * match), `$1`–`$99` (numbered groups), `$<name>` (named groups) and `$$`.
 * References to groups that do not exist are kept verbatim, like `String#replace`.
 */
export function expandReplacement(replacement: string, match: TextMatch, isRegexp: boolean): string {
  if (!isRegexp) return replacement;
  const groupCount = match.captures.length - 1;
  const capture = (index: number): string => match.captures[index] ?? '';
  return replacement.replace(/\$(\$|&|<[^>]*>|\d{1,2})/g, (token, kind: string) => {
    if (kind === '$') return '$';
    if (kind === '&') return capture(0);
    if (kind.startsWith('<')) {
      const name = kind.slice(1, -1);
      const groups = match.groups ?? {};
      return name in groups ? (groups[name] ?? '') : token;
    }
    const twoDigit = Number(kind);
    if (twoDigit >= 1 && twoDigit <= groupCount) return capture(twoDigit);
    const oneDigit = Number(kind.charAt(0));
    if (oneDigit >= 1 && oneDigit <= groupCount) return capture(oneDigit) + kind.slice(1);
    return token;
  });
}
