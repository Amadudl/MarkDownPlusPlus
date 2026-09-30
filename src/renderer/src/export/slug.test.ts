import { describe, expect, it } from 'vitest';
import { createSlugger, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  Getting   Started!  ', 'getting-started'],
    ['C++ & C# (2024)', 'c-c-2024'],
    ['snake_case and-kebab', 'snake_case-and-kebab'],
    ['Überschrift mit Umlauten', 'überschrift-mit-umlauten'],
    ['日本語 見出し', '日本語-見出し'],
    ['!!!', 'section'],
    ['', 'section'],
    ['- dash -', 'dash'],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('limits the slug length', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(80);
  });
});

describe('createSlugger', () => {
  it('deduplicates repeated headings', () => {
    const slugger = createSlugger();
    expect([slugger.slug('Intro'), slugger.slug('Intro'), slugger.slug('intro')]).toEqual([
      'intro',
      'intro-1',
      'intro-2',
    ]);
  });

  it('never returns reserved or forbidden ids', () => {
    const slugger = createSlugger((id) => id === 'location');
    slugger.reserve('notes');
    expect(slugger.slug('Notes')).toBe('notes-1');
    expect(slugger.slug('Location')).toBe('location-1');
  });
});
