import { describe, expect, it } from 'vitest';
import { HEADING_SCALE_RANGE } from '@shared/theme-model';
import {
  MAX_THEME_FILE_LENGTH,
  THEME_FILE_FORMAT,
  THEME_FILE_VERSION,
  detectThemeLayer,
  parseThemeImport,
  serializeThemeExport,
} from './theme-io';
import { BUILTIN_CODE_THEMES } from './presets/code-themes';
import { BUILTIN_ELEMENT_STYLES } from './presets/element-styles';
import { BUILTIN_UI_THEMES } from './presets/ui-themes';

const ui = BUILTIN_UI_THEMES[0]!;
const code = BUILTIN_CODE_THEMES[0]!;
const elements = BUILTIN_ELEMENT_STYLES[0]!;

describe('detectThemeLayer', () => {
  it('recognises each layer by its distinctive keys', () => {
    expect(detectThemeLayer(ui)).toBe('ui');
    expect(detectThemeLayer(code)).toBe('code');
    expect(detectThemeLayer(elements)).toBe('elements');
  });

  it.each([null, 42, 'theme', {}, { colors: null }, { colors: 'x' }, { colors: { foo: '#fff' } }])(
    'returns null for %j',
    (value) => {
      expect(detectThemeLayer(value)).toBeNull();
    },
  );
});

describe('serializeThemeExport / parseThemeImport', () => {
  it.each([
    ['ui', ui],
    ['code', code],
    ['elements', elements],
  ] as const)('round-trips a %s theme', (kind, theme) => {
    const json = serializeThemeExport(theme);
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json)).toMatchObject({ format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, kind });
    expect(parseThemeImport(json)).toEqual({ kind, theme });
  });

  it('accepts a bare theme object', () => {
    expect(parseThemeImport(JSON.stringify(code))).toEqual({ kind: 'code', theme: code });
    expect(parseThemeImport(JSON.stringify(ui))).toEqual({ kind: 'ui', theme: ui });
  });

  it('applies schema defaults and strips unknown keys', () => {
    const raw: Record<string, unknown> = { ...code, extra: '<script>' };
    delete raw.description;
    delete raw.italicComments;
    const parsed = parseThemeImport(JSON.stringify(raw));
    expect(parsed.kind).toBe('code');
    expect(parsed.theme).toEqual({ ...code, description: '', italicComments: true });
  });

  it('refuses to serialise objects that are not themes', () => {
    expect(() => serializeThemeExport({ id: 'x' } as never)).toThrow('Unsupported theme object.');
  });
});

describe('parseThemeImport errors', () => {
  it('rejects oversized files before parsing', () => {
    expect(() => parseThemeImport(' '.repeat(MAX_THEME_FILE_LENGTH + 1))).toThrow(/too large/);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseThemeImport('{nope')).toThrow('The theme file is not valid JSON.');
  });

  it('rejects files from newer versions', () => {
    const json = JSON.stringify({ format: THEME_FILE_FORMAT, version: 99, kind: 'ui', theme: ui });
    expect(() => parseThemeImport(json)).toThrow(/newer version/);
  });

  it('reports a malformed envelope', () => {
    const json = JSON.stringify({ format: THEME_FILE_FORMAT, version: 1, kind: 'fonts', theme: {} });
    expect(() => parseThemeImport(json)).toThrow(/^Invalid theme file: kind:/);
    expect(() => parseThemeImport(JSON.stringify({ format: 'other' }))).toThrow(/^Invalid theme file: /);
  });

  it('rejects JSON that is not a theme', () => {
    expect(() => parseThemeImport('[1,2,3]')).toThrow('The file does not contain a MarkDown++ theme.');
    expect(() => parseThemeImport('null')).toThrow('The file does not contain a MarkDown++ theme.');
  });

  it('lists the offending fields with readable messages', () => {
    const broken = { ...ui, colors: { ...ui.colors, accent: 'red' } };
    expect(() => parseThemeImport(JSON.stringify(broken))).toThrow(
      'Invalid UI theme: colors.accent: Expected a hex colour such as #1e1e1e',
    );
    const brokenElements = { ...elements, id: 'Bad Id' };
    expect(() => parseThemeImport(serializeThemeExport(brokenElements))).toThrow(
      /^Invalid element style: id: /,
    );
    const brokenCode = { ...code, name: '' };
    expect(() => parseThemeImport(JSON.stringify(brokenCode))).toThrow(/^Invalid code theme: name: /);
  });

  it('rejects heading scales outside the supported range', () => {
    const scaled = (scale: number[]): string =>
      JSON.stringify({ ...elements, headings: { ...elements.headings, scale } });
    expect(() => parseThemeImport(scaled([100000, 1.5, 1.25, 1, 1, 1]))).toThrow(
      /^Invalid element style: headings\.scale\.0: /,
    );
    expect(() => parseThemeImport(scaled([2, 1.5, 1.25, 1, 1, -1]))).toThrow(
      /^Invalid element style: headings\.scale\.5: /,
    );
    const bounds = [HEADING_SCALE_RANGE.max, 3, 2, 1, 0.8, HEADING_SCALE_RANGE.min];
    const imported = parseThemeImport(scaled(bounds));
    expect(imported.kind).toBe('elements');
    expect(imported.theme).toMatchObject({ headings: { scale: bounds } });
  });

  it('summarises long issue lists', () => {
    const colors = Object.fromEntries(Object.keys(ui.colors).map((key) => [key, 'nope']));
    expect(() => parseThemeImport(JSON.stringify({ ...ui, colors }))).toThrow(/\(and \d+ more\)$/);
  });

  it('reports issues at the root without a path', () => {
    const json = JSON.stringify({ format: THEME_FILE_FORMAT, version: 1, kind: 'ui', theme: 'x' });
    expect(() => parseThemeImport(json)).toThrow(/^Invalid UI theme: [A-Z]/);
  });
});
