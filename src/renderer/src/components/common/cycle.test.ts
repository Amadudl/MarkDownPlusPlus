import { describe, expect, it } from 'vitest';
import { cycleItem } from './cycle';

describe('cycleItem', () => {
  const items = ['a', 'b', 'c'];

  it('moves forward and backward with wrap-around', () => {
    expect(cycleItem(items, 'a', 1)).toBe('b');
    expect(cycleItem(items, 'c', 1)).toBe('a');
    expect(cycleItem(items, 'a', -1)).toBe('c');
    expect(cycleItem(items, 'b', 4)).toBe('c');
  });

  it('starts at the edges for unknown items and keeps the value for empty lists', () => {
    expect(cycleItem(items, 'x', 1)).toBe('a');
    expect(cycleItem(items, 'x', -1)).toBe('c');
    expect(cycleItem([], 'x', 1)).toBe('x');
  });
});
