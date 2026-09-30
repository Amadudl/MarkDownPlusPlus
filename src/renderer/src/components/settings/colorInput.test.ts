import { describe, expect, it } from 'vitest';
import { humanizeKey, isHexColor, mergePickedColor, toColorInputValue } from './colorInput';

describe('colour input helpers', () => {
  it('validates hex colours', () => {
    expect(['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4'].every(isHexColor)).toBe(true);
    expect(['fff', '#ff', '#ggg', 'red'].some(isHexColor)).toBe(false);
  });

  it('converts to the #rrggbb format required by <input type=color>', () => {
    expect(toColorInputValue('#ABC')).toBe('#aabbcc');
    expect(toColorInputValue('#abcd')).toBe('#aabbcc');
    expect(toColorInputValue('#112233cc')).toBe('#112233');
    expect(toColorInputValue('nope')).toBe('#000000');
  });

  it('keeps the alpha channel of the original colour', () => {
    expect(mergePickedColor('#11223380', '#AABBCC')).toBe('#aabbcc80');
    expect(mergePickedColor('#1238', '#aabbcc')).toBe('#aabbcc88');
    expect(mergePickedColor('#123456', '#aabbcc')).toBe('#aabbcc');
    expect(mergePickedColor('broken', '#aabbcc')).toBe('#aabbcc');
  });

  it('humanizes camelCase keys', () => {
    expect(humanizeKey('surfaceElevated')).toBe('Surface elevated');
    expect(humanizeKey('text')).toBe('Text');
  });
});
