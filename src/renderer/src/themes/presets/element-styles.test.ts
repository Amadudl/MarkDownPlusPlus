import { describe, expect, it } from 'vitest';
import { elementStyleSchema } from '@shared/theme-model';
import { sanitizeFontFamily } from '../engine';
import { BUILTIN_ELEMENT_STYLES, DEFAULT_ELEMENT_STYLE } from './element-styles';

const REQUIRED_IDS = [
  'modern',
  'github',
  'academic',
  'minimal',
  'typewriter',
  'editorial',
  'compact',
  'book',
  'technical',
  'playful',
  'classic',
];

const shape = elementStyleSchema.shape;
const entries = BUILTIN_ELEMENT_STYLES.map((style) => [style.id, style] as const);

describe('built-in element styles', () => {
  it('contains every required style exactly once', () => {
    const ids = BUILTIN_ELEMENT_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_IDS));
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('defaults to Modern', () => {
    expect(DEFAULT_ELEMENT_STYLE.id).toBe('modern');
    expect(BUILTIN_ELEMENT_STYLES).toContain(DEFAULT_ELEMENT_STYLE);
  });

  it.each(entries)('%s is valid', (_id, style) => {
    expect(elementStyleSchema.parse(style)).toEqual(style);
  });

  it.each(entries)('%s uses fonts that survive sanitising unchanged', (_id, style) => {
    for (const font of Object.values(style.typography).filter((value) => typeof value === 'string')) {
      expect(sanitizeFontFamily(font, 'fallback')).toBe(font);
    }
  });

  it.each(entries)('%s has a monotonically decreasing heading scale', (_id, style) => {
    const { scale } = style.headings;
    for (let index = 1; index < scale.length; index += 1) {
      expect(scale[index]).toBeLessThanOrEqual(scale[index - 1]!);
    }
  });

  it('uses every variant of every enum at least once across the presets', () => {
    const used = (pick: (style: (typeof BUILTIN_ELEMENT_STYLES)[number]) => string): Set<string> =>
      new Set(BUILTIN_ELEMENT_STYLES.map(pick));
    expect(used((s) => s.blockquote.variant)).toEqual(new Set(shape.blockquote.shape.variant.options));
    expect(used((s) => s.codeBlock.variant)).toEqual(new Set(shape.codeBlock.shape.variant.options));
    expect(used((s) => s.inlineCode.variant)).toEqual(new Set(shape.inlineCode.shape.variant.options));
    expect(used((s) => s.table.variant)).toEqual(new Set(shape.table.shape.variant.options));
    expect(used((s) => s.list.bullet)).toEqual(new Set(shape.list.shape.bullet.options));
    expect(used((s) => s.link.variant)).toEqual(new Set(shape.link.shape.variant.options));
    expect(used((s) => s.horizontalRule.variant)).toEqual(
      new Set(shape.horizontalRule.shape.variant.options),
    );
    expect(used((s) => s.headings.color)).toEqual(new Set(shape.headings.shape.color.options));
    expect(used((s) => s.headings.underline)).toEqual(new Set(shape.headings.shape.underline.options));
  });

  it.each(['editorial', 'playful', 'classic'])(
    '%s leads every font stack with a bundled face or a core font of macOS and Windows',
    (id) => {
      const style = BUILTIN_ELEMENT_STYLES.find((candidate) => candidate.id === id);
      const portable = new Set([
        "'Inter Variable'",
        "'JetBrains Mono Variable'",
        'Georgia',
        'Arial',
        "'Courier New'",
      ]);
      const { bodyFont, headingFont, monoFont } = style?.typography ?? {};
      for (const stack of [bodyFont, headingFont, monoFont]) {
        expect(portable.has(stack?.split(',')[0]?.trim() ?? ''), `${id}: ${stack ?? ''}`).toBe(true);
      }
    },
  );

  it('never depends on display faces that are neither bundled nor installed by default', () => {
    const missing = /Playfair|Didot|Bodoni|Fredoka|Nunito|Quicksand|Calibri|Cambria|Carlito|Caladea/;
    for (const style of BUILTIN_ELEMENT_STYLES) {
      expect(Object.values(style.typography).join(' '), style.id).not.toMatch(missing);
      expect(style.description, style.id).not.toMatch(missing);
    }
  });

  it('has unique names and descriptions', () => {
    expect(new Set(BUILTIN_ELEMENT_STYLES.map((s) => s.name)).size).toBe(BUILTIN_ELEMENT_STYLES.length);
    for (const style of BUILTIN_ELEMENT_STYLES) expect(style.description.length).toBeGreaterThan(10);
  });
});
