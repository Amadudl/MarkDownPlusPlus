import { describe, expect, it } from 'vitest';
import { COLUMN_WIDTH_VAR, columnWidthValue, toggledWidthMode } from './columnWidth';

describe('columnWidthValue', () => {
  it('leaves the theme width in place for the theme mode', () => {
    expect(columnWidthValue({ widthMode: 'theme', customWidth: 1600 })).toBeUndefined();
  });

  it('spans the editor area in full mode, whatever the custom width', () => {
    expect(columnWidthValue({ widthMode: 'full', customWidth: 1600 })).toBe('100%');
  });

  it('uses the custom width in whole pixels in custom mode', () => {
    expect(columnWidthValue({ widthMode: 'custom', customWidth: 1600 })).toBe('1600px');
    expect(columnWidthValue({ widthMode: 'custom', customWidth: 999.6 })).toBe('1000px');
  });

  it('names the variable the stylesheets read', () => {
    expect(COLUMN_WIDTH_VAR).toBe('--mpp-editor-column-width');
  });
});

describe('toggledWidthMode', () => {
  it('enters full width from the theme and the custom mode', () => {
    expect(toggledWidthMode('theme', 'custom')).toBe('full');
    expect(toggledWidthMode('custom', 'theme')).toBe('full');
  });

  it('returns to the previous mode from full width', () => {
    expect(toggledWidthMode('full', 'theme')).toBe('theme');
    expect(toggledWidthMode('full', 'custom')).toBe('custom');
  });
});
