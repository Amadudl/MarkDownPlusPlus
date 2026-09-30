import type { CodeTheme, ElementStyle, UiTheme } from '@shared/theme-model';

const ID_PREFIX = 'custom-';
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 64;

/** Normalises and validates a user-entered theme name. */
function normalizeName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) throw new Error('Please enter a name for the theme.');
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Theme names can have at most ${MAX_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

/** Lowercase kebab-case slug made of ASCII letters and digits (accents are stripped). */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a unique, schema-valid id `custom-<slug>` (with `-2`, `-3`, … appended on
 * collisions) that never exceeds the 64 character id limit.
 */
export function uniqueCustomId(name: string, existingIds: readonly string[]): string {
  const taken = new Set(existingIds);
  const slug = slugify(name) || 'theme';
  for (let counter = 1; ; counter += 1) {
    const suffix = counter === 1 ? '' : `-${counter}`;
    const room = MAX_ID_LENGTH - ID_PREFIX.length - suffix.length;
    const base = slug.slice(0, room).replace(/-+$/, '');
    const id = `${ID_PREFIX}${base}${suffix}`;
    if (!taken.has(id)) return id;
  }
}

function duplicate<T extends { id: string; name: string }>(
  base: T,
  name: string,
  existingIds: readonly string[],
): T {
  const cleanName = normalizeName(name);
  return { ...structuredClone(base), id: uniqueCustomId(cleanName, existingIds), name: cleanName };
}

/**
 * Creates an editable copy of a UI theme with a unique `custom-…` id.
 * @throws Error when the name is empty or longer than 64 characters.
 */
export function createCustomUiTheme(base: UiTheme, name: string, existingIds: readonly string[]): UiTheme {
  return duplicate(base, name, existingIds);
}

/**
 * Creates an editable copy of a code theme with a unique `custom-…` id.
 * @throws Error when the name is empty or longer than 64 characters.
 */
export function createCustomCodeTheme(
  base: CodeTheme,
  name: string,
  existingIds: readonly string[],
): CodeTheme {
  return duplicate(base, name, existingIds);
}

/**
 * Creates an editable copy of an element style with a unique `custom-…` id.
 * @throws Error when the name is empty or longer than 64 characters.
 */
export function createCustomElementStyle(
  base: ElementStyle,
  name: string,
  existingIds: readonly string[],
): ElementStyle {
  return duplicate(base, name, existingIds);
}
