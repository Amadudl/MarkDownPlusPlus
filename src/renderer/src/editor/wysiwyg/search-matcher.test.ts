import { describe, expect, it } from 'vitest';
import type { SearchQuery } from '../types';
import {
  type CompiledSearch,
  compileSearchQuery,
  escapeRegExp,
  expandReplacement,
  findTextMatches,
  hasNestedQuantifier,
  MAX_SEARCH_MATCHES,
  NESTED_QUANTIFIER_ERROR,
  type TextMatch,
} from './search-matcher';

const query = (text: string, overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
  ...overrides,
});

function compile(q: SearchQuery): CompiledSearch {
  const result = compileSearchQuery(q);
  if (!result.ok || result.search === null) throw new Error('expected a compiled query');
  return result.search;
}

const ranges = (matches: readonly TextMatch[]): [number, number][] => matches.map((m) => [m.from, m.to]);

describe('escapeRegExp', () => {
  it('escapes all syntax characters so they match literally in unicode mode', () => {
    const special = '.*+?^${}()|[]\\';
    const regexp = new RegExp(escapeRegExp(special), 'u');
    expect(regexp.test(`x${special}y`)).toBe(true);
    expect(escapeRegExp('a-b/c')).toBe('a-b/c');
  });
});

describe('compileSearchQuery', () => {
  it('returns no search for an empty query', () => {
    expect(compileSearchQuery(query(''))).toEqual({ ok: true, search: null });
  });

  it('reports invalid regular expressions with the engine message', () => {
    const result = compileSearchQuery(query('a(', { regexp: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Invalid regular expression/);
  });

  it('treats regexp syntax literally when regexp mode is off', () => {
    const search = compile(query('a.c'));
    expect(ranges(findTextMatches('abc a.c', search))).toEqual([[4, 7]]);
    expect(search.isRegexp).toBe(false);
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(findTextMatches('Foo foo FOO', compile(query('foo')))).toHaveLength(3);
    expect(ranges(findTextMatches('Foo foo FOO', compile(query('foo', { caseSensitive: true }))))).toEqual([
      [4, 7],
    ]);
  });

  it('matches whole words only, unicode-aware', () => {
    const search = compile(query('über', { wholeWord: true }));
    expect(ranges(findTextMatches('über überall _über über2 (über)', search))).toEqual([
      [0, 4],
      [26, 30],
    ]);
  });

  it('supports whole-word regular expressions with alternation', () => {
    const search = compile(query('cat|dog', { wholeWord: true, regexp: true }));
    expect(ranges(findTextMatches('cat dogs hotdog dog', search))).toEqual([
      [0, 3],
      [16, 19],
    ]);
  });
});

describe('findTextMatches', () => {
  it('finds overlapping candidates left to right without overlaps', () => {
    expect(ranges(findTextMatches('aaaa', compile(query('aa'))))).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it('skips zero-length matches and still finds real ones', () => {
    const search = compile(query('x*', { regexp: true }));
    expect(ranges(findTextMatches('axxbx', search))).toEqual([
      [1, 3],
      [4, 5],
    ]);
    expect(findTextMatches('abc', compile(query('^', { regexp: true })))).toEqual([]);
  });

  it('advances over astral characters on zero-length matches', () => {
    const search = compile(query('(?:)', { regexp: true }));
    expect(findTextMatches('😀a', search)).toEqual([]);
  });

  it('returns nothing for empty text or a non-positive limit', () => {
    const search = compile(query('a'));
    expect(findTextMatches('', search)).toEqual([]);
    expect(findTextMatches('aaa', search, 0)).toEqual([]);
  });

  it('caps the number of matches', () => {
    const search = compile(query('a'));
    expect(findTextMatches('a'.repeat(50), search, 5)).toHaveLength(5);
    expect(findTextMatches('a'.repeat(MAX_SEARCH_MATCHES + 10), search)).toHaveLength(MAX_SEARCH_MATCHES);
  });

  it('records captures and named groups and resets lastIndex', () => {
    const search = compile(query('(?<key>\\w+)=(\\d+)', { regexp: true }));
    const [match] = findTextMatches('a=1 b=x', search);
    expect(match?.captures).toEqual(['a=1', 'a', '1']);
    expect(match?.groups).toEqual({ key: 'a' });
    expect(search.regexp.lastIndex).toBe(0);
    expect(findTextMatches('a=1', search)).toHaveLength(1);
  });
});

describe('expandReplacement', () => {
  const regexMatch = (text: string, pattern: string): TextMatch => {
    const [match] = findTextMatches(text, compile(query(pattern, { regexp: true })));
    if (match === undefined) throw new Error('no match');
    return match;
  };

  it('inserts plain-text replacements literally', () => {
    const [match] = findTextMatches('abc', compile(query('b')));
    expect(expandReplacement('$& $1 $$', match!, false)).toBe('$& $1 $$');
  });

  it('expands $&, $$, numbered and named groups', () => {
    const match = regexMatch('john smith', '(?<first>\\w+) (\\w+)');
    expect(expandReplacement('$2, $<first> [$&] $$', match, true)).toBe('smith, john [john smith] $');
  });

  it('prefers two-digit group references when they exist and falls back to one digit', () => {
    const many = regexMatch('abcdefghijk', '(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)');
    expect(expandReplacement('$11|$10|$12', many, true)).toBe('k|j|a2');
    const two = regexMatch('ab', '(a)(b)');
    expect(expandReplacement('$10 $2', two, true)).toBe('a0 b');
  });

  it('keeps references to missing groups verbatim', () => {
    const match = regexMatch('ab', '(a)b');
    expect(expandReplacement('$0 $5 $<nope>', match, true)).toBe('$0 $5 $<nope>');
    const noGroups = regexMatch('ab', 'ab');
    expect(expandReplacement('$<x>', noGroups, true)).toBe('$<x>');
  });

  it('expands unmatched optional groups to the empty string', () => {
    const match = regexMatch('a', '(a)(b)?(?<opt>c)?');
    expect(expandReplacement('[$2][$<opt>]', match, true)).toBe('[][]');
  });
});

describe('hasNestedQuantifier', () => {
  it.each([
    '(a+)+',
    '(a+)+$',
    '(a*)*',
    '(?:\\w*x)*',
    '(a|b+){2,}',
    '(a{1,3})+',
    '((a)+)+',
    '((a+))*',
    '(?<name>x+)+',
    '([a-z]+)*end',
    '(\\d+\\.?)+',
    '(a+){2,5}',
  ])('flags %s', (source) => {
    expect(hasNestedQuantifier(source)).toBe(true);
  });

  it.each([
    'a+b+',
    '(ab)+',
    '(a|b)*',
    '(a{2})+',
    '(a?)+',
    '(a+)?',
    '(a+){1}',
    '[(a+)]+',
    '\\(a+\\)+',
    '(?=a+)',
    '(?<=x)y+',
    '(?<!x)y+',
    '(?i:a+)',
    '\\p{L}+',
    'x{2,3}',
    'a{,3}+',
    '(a+?)',
    '(a',
    '(?<unterminated',
    '(?unterminated',
    '[abc',
    'a)+',
  ])('accepts %s', (source) => {
    expect(hasNestedQuantifier(source)).toBe(false);
  });

  it('makes compileSearchQuery refuse nested repetition only for regular expressions', () => {
    expect(compileSearchQuery(query('(a+)+', { regexp: true }))).toEqual({
      ok: false,
      error: NESTED_QUANTIFIER_ERROR,
    });
    expect(compileSearchQuery(query('(a+)+')).ok).toBe(true);
    const invalid = compileSearchQuery(query('(a+)+[', { regexp: true }));
    expect(invalid.ok).toBe(false);
    expect(invalid).not.toEqual({ ok: false, error: NESTED_QUANTIFIER_ERROR });
  });
});
