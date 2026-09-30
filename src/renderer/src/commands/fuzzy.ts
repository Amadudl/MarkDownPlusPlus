/** Result of matching a query against a text. */
export interface FuzzyMatch {
  /** Higher is better. */
  readonly score: number;
  /** Indices of the matched characters in the text (for highlighting). */
  readonly indices: readonly number[];
}

const WORD_BOUNDARY = /[\s\-_./\\:()]/;

/**
 * Sequential fuzzy matching (every query character must appear in order).
 * Rewards consecutive runs, word starts and prefix matches; penalises gaps.
 * Returns null when the text does not match. An empty query matches everything.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { score: 0, indices: [] };
  const haystack = text.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of needle) {
    if (char === ' ') continue;
    const index = haystack.indexOf(char, from);
    if (index === -1) return null;
    const atWordStart = index === 0 || WORD_BOUNDARY.test(haystack.charAt(index - 1));
    score += 1;
    if (index === previous + 1) score += 5;
    if (atWordStart) score += 8;
    score -= Math.min(index - from, 10) * 0.2;
    indices.push(index);
    previous = index;
    from = index + 1;
  }
  if (haystack.startsWith(needle)) score += 20;
  else if (haystack.includes(needle)) score += 10;
  score -= haystack.length * 0.01;
  return { score, indices };
}

/**
 * Filters and sorts items by fuzzy score (stable for equal scores).
 * @param key returns the text an item is matched against.
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  key: (item: T) => string,
): { item: T; match: FuzzyMatch }[] {
  const results: { item: T; match: FuzzyMatch; order: number }[] = [];
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, key(item));
    if (match !== null) results.push({ item, match, order });
  });
  if (query.trim() !== '') results.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return results.map(({ item, match }) => ({ item, match }));
}
