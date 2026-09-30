import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches everything for an empty query', () => {
    expect(fuzzyMatch('  ', 'Anything')).toEqual({ score: 0, indices: [] });
  });

  it('matches characters in order and reports their indices', () => {
    expect(fuzzyMatch('tgm', 'Toggle Mode')?.indices).toEqual([0, 2, 7]);
    expect(fuzzyMatch('xyz', 'Toggle Mode')).toBeNull();
    expect(fuzzyMatch('mt', 'Toggle Mode')).toBeNull();
  });

  it('ignores spaces in the query', () => {
    expect(fuzzyMatch('to mo', 'Toggle Mode')).not.toBeNull();
  });

  it('prefers prefixes, substrings and word starts', () => {
    const prefix = fuzzyMatch('sav', 'Save')!.score;
    const substring = fuzzyMatch('sav', 'Autosave')!.score;
    const scattered = fuzzyMatch('sav', 'Disk space overview')!.score;
    const acronym = fuzzyMatch('sav', 'Show all views')!.score;
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(scattered);
    expect(acronym).toBeGreaterThan(scattered);
  });
});

describe('fuzzyFilter', () => {
  const items = ['Save As…', 'Save', 'Open…', 'Toggle Outline'];

  it('keeps the original order without a query', () => {
    expect(fuzzyFilter(items, '', (item) => item).map((entry) => entry.item)).toEqual(items);
  });

  it('sorts by score and keeps ties stable', () => {
    expect(fuzzyFilter(items, 'save', (item) => item).map((entry) => entry.item)).toEqual([
      'Save',
      'Save As…',
    ]);
    expect(fuzzyFilter(['ab', 'ab'], 'ab', (item) => item)).toHaveLength(2);
    expect(fuzzyFilter(items, 'o', (item) => item).map((entry) => entry.item)[0]).toBe('Open…');
  });
});
