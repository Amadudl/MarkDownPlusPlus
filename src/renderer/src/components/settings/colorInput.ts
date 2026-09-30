const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** True for #rgb, #rgba, #rrggbb and #rrggbbaa. */
export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function expand(hex: string): string {
  const digits = hex.slice(1);
  if (digits.length === 3 || digits.length === 4) return `#${digits.replace(/./g, (digit) => digit + digit)}`;
  return hex;
}

/** `<input type="color">` only accepts `#rrggbb`: expands short forms and drops alpha. */
export function toColorInputValue(hex: string): string {
  if (!isHexColor(hex)) return '#000000';
  return expand(hex).slice(0, 7).toLowerCase();
}

/** Applies a colour picked in `<input type="color">` while keeping the original alpha channel. */
export function mergePickedColor(original: string, picked: string): string {
  const full = isHexColor(original) ? expand(original) : '#000000';
  const alpha = full.length === 9 ? full.slice(7) : '';
  return `${picked.slice(0, 7).toLowerCase()}${alpha}`;
}

/** Converts `surfaceElevated` to `Surface elevated`. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
