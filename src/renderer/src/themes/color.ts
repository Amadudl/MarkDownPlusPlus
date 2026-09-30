/**
 * Small, dependency-free colour utilities used by the theme engine and the
 * theme editor (contrast warnings). Only hex notation is supported because it is
 * the only notation allowed by the theme schemas (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`).
 */

/** An RGBA colour with 0-255 channels and a 0-1 alpha. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Parses a hex colour.
 * @throws Error when the value is not a valid `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` colour.
 */
export function parseHexColor(value: string): Rgba {
  const hex = value.trim();
  if (!HEX.test(hex)) throw new Error(`Invalid hex colour: "${value}"`);
  const digits = hex.slice(1);
  const expanded =
    digits.length <= 4
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  const channel = (index: number): number => Number.parseInt(expanded.slice(index * 2, index * 2 + 2), 16);
  return {
    r: channel(0),
    g: channel(1),
    b: channel(2),
    a: expanded.length === 8 ? channel(3) / 255 : 1,
  };
}

/** Formats a colour as lowercase `#rrggbb` (alpha is dropped). */
export function toHex({ r, g, b }: Rgba): string {
  const part = (channel: number): string =>
    Math.round(Math.min(255, Math.max(0, channel)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Composites `top` over an opaque `bottom` colour (source-over). The result is opaque. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number): number => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/**
 * Linear interpolation between two colours in sRGB space.
 * @param amount 0 returns `from`, 1 returns `to`.
 */
export function mixColors(from: string, to: string, amount: number): string {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  const t = Math.min(1, Math.max(0, amount));
  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: 1,
  });
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an opaque colour (0 = black, 1 = white). */
export function relativeLuminance(color: Rgba): number {
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

/**
 * WCAG 2.x contrast ratio between a foreground and a background colour (1 - 21).
 * Translucent backgrounds are composited over white, translucent foregrounds over
 * the (composited) background, which is how they are perceived on screen.
 * @throws Error when either colour is not a valid hex colour.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = composite(parseHexColor(background), WHITE);
  const fg = composite(parseHexColor(foreground), bg);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}
