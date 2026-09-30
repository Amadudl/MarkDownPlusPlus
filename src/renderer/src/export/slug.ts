const MAX_SLUG_LENGTH = 80;

/**
 * GitHub-style slug of a heading text: lower-cased, punctuation removed, whitespace
 * collapsed to `-`. Letters and digits of every script are kept. Falls back to
 * `section` when nothing is left.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'section' : slug;
}

/** Produces unique slugs for one document. */
export interface Slugger {
  /** Returns a slug for `value` that has not been returned or reserved before. */
  slug(value: string): string;
  /** Marks an id (for example one generated elsewhere) as taken. */
  reserve(id: string): void;
}

/**
 * Creates a {@link Slugger}. Duplicates get `-1`, `-2`, ... suffixes. Ids for which
 * `isForbidden` returns true (e.g. names that would clobber DOM properties and would
 * therefore be stripped by the sanitiser) are skipped the same way.
 */
export function createSlugger(isForbidden: (id: string) => boolean = () => false): Slugger {
  const used = new Set<string>();
  return {
    slug(value: string): string {
      const base = slugify(value);
      let candidate = base;
      let counter = 0;
      while (used.has(candidate) || isForbidden(candidate)) {
        counter += 1;
        candidate = `${base}-${counter}`;
      }
      used.add(candidate);
      return candidate;
    },
    reserve(id: string): void {
      used.add(id);
    },
  };
}
