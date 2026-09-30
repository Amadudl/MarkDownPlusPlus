import type { MarkdownNode } from '@milkdown/kit/transformer';
import { describe, expect, it } from 'vitest';
import {
  normalizeImageNodes,
  parseImageAlt,
  serializeImageAlt,
  STRINGIFY_OPTIONS,
  stringOr,
} from './markdown-fidelity';

describe('stringOr', () => {
  it('keeps strings and replaces everything else', () => {
    expect(stringOr('a')).toBe('a');
    expect(stringOr(null)).toBe('');
    expect(stringOr(3, 'x')).toBe('x');
  });
});

describe('normalizeImageNodes', () => {
  it('fills missing titles and alt texts of image nodes only', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'image', url: 'a.png', title: null, alt: null }] },
        { type: 'image-block', url: 'b.png', title: 'Kept', alt: 'Alt' },
        { type: 'link', url: 'c', title: null },
      ],
    } as unknown as MarkdownNode;
    normalizeImageNodes(tree);
    const [paragraph, block, link] = tree.children ?? [];
    expect(paragraph?.children?.[0]).toMatchObject({ title: '', alt: '' });
    expect(block).toMatchObject({ title: 'Kept', alt: 'Alt' });
    expect(link?.title).toBeNull();
  });
});

describe('image alt handling', () => {
  it("reads Crepe's ratio format and keeps real alternative text", () => {
    expect(parseImageAlt('0.50')).toEqual({ ratio: 0.5, alt: '' });
    expect(parseImageAlt('1.00')).toEqual({ ratio: 1, alt: '' });
    expect(parseImageAlt('0.00')).toEqual({ ratio: 1, alt: '0.00' });
    expect(parseImageAlt('2024')).toEqual({ ratio: 1, alt: '2024' });
    expect(parseImageAlt('A diagram')).toEqual({ ratio: 1, alt: 'A diagram' });
    expect(parseImageAlt(undefined)).toEqual({ ratio: 1, alt: '' });
  });

  it('writes the ratio of resized images and the alt text otherwise', () => {
    expect(serializeImageAlt(0.5, 'ignored')).toBe('0.50');
    expect(serializeImageAlt('1.5', '')).toBe('1.50');
    expect(serializeImageAlt(1, 'A diagram')).toBe('A diagram');
    expect(serializeImageAlt(Number.NaN, 'x')).toBe('x');
    expect(serializeImageAlt(-2, null)).toBe('');
  });
});

describe('STRINGIFY_OPTIONS', () => {
  it('uses the conventional GitHub markdown style', () => {
    expect(STRINGIFY_OPTIONS).toMatchObject({
      bullet: '-',
      emphasis: '*',
      strong: '*',
      fence: '`',
      rule: '-',
    });
  });
});
