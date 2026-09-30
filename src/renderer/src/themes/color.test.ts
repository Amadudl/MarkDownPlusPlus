import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, mixColors, parseHexColor, relativeLuminance, toHex } from './color';

describe('parseHexColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
    ['#0f08', { r: 0, g: 255, b: 0, a: 136 / 255 }],
    ['#1E1E1E', { r: 30, g: 30, b: 30, a: 1 }],
    ['#11223380', { r: 17, g: 34, b: 51, a: 128 / 255 }],
    ['  #abc  ', { r: 170, g: 187, b: 204, a: 1 }],
  ])('parses %s', (input, expected) => {
    expect(parseHexColor(input)).toEqual(expected);
  });

  it.each(['', 'fff', '#ff', '#fffff', '#ggg', 'red', 'rgb(0,0,0)', '#1234567'])('rejects %j', (input) => {
    expect(() => parseHexColor(input)).toThrow(/Invalid hex colour/);
  });
});

describe('toHex', () => {
  it('formats and clamps channels', () => {
    expect(toHex({ r: 255, g: 0, b: 127.6, a: 0.2 })).toBe('#ff0080');
    expect(toHex({ r: 300, g: -5, b: 16, a: 1 })).toBe('#ff0010');
  });
});

describe('composite', () => {
  it('blends a translucent colour over an opaque one', () => {
    const result = composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 });
    expect(result).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });
});

describe('mixColors', () => {
  it('interpolates and clamps the amount', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#000', '#fff', 2)).toBe('#ffffff');
    expect(mixColors('#000', '#fff', -1)).toBe('#000000');
  });
});

describe('relativeLuminance', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance(parseHexColor('#000'))).toBe(0);
    expect(relativeLuminance(parseHexColor('#fff'))).toBeCloseTo(1, 10);
    // Low channel values use the linear segment of the sRGB curve.
    expect(relativeLuminance(parseHexColor('#0a0a0a'))).toBeCloseTo(0.003035, 5);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
  });

  it('is 1 for identical colours', () => {
    expect(contrastRatio('#777', '#777777')).toBe(1);
  });

  it('matches known WCAG values', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#595959', '#ffffff')).toBeCloseTo(7.0, 1);
  });

  it('composites translucent colours before measuring', () => {
    // A fully transparent foreground is invisible: ratio 1.
    expect(contrastRatio('#00000000', '#ffffff')).toBe(1);
    // 50 % black over white is mid grey.
    expect(contrastRatio('#00000080', '#fff')).toBeCloseTo(contrastRatio('#7f7f7f', '#fff'), 1);
    // A transparent background counts as white.
    expect(contrastRatio('#000', '#00000000')).toBeCloseTo(21, 10);
  });

  it('throws for invalid input', () => {
    expect(() => contrastRatio('black', '#fff')).toThrow();
  });
});
