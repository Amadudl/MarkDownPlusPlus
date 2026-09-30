import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  parseSettings,
  SETTINGS_VERSION,
  type Settings,
} from './settings';
import type { UiTheme } from './theme-model';

const color = '#112233';
const customTheme = (id: string): UiTheme => ({
  id,
  name: `Theme ${id}`,
  kind: 'dark',
  colors: {
    background: color,
    surface: color,
    surfaceElevated: color,
    surfaceSunken: color,
    border: color,
    borderStrong: color,
    text: color,
    textMuted: color,
    textFaint: color,
    accent: color,
    accentHover: color,
    accentText: color,
    selection: color,
    focusRing: color,
    danger: color,
    warning: color,
    success: color,
    editorBackground: color,
    editorText: color,
    link: color,
    heading: color,
    quoteBar: color,
    quoteBackground: color,
    tableBorder: color,
    tableHeaderBackground: color,
    tableStripe: color,
    inlineCodeBackground: color,
    inlineCodeText: color,
    mark: color,
  },
});

describe('DEFAULT_SETTINGS', () => {
  it('is fully populated with sensible defaults', () => {
    expect(DEFAULT_SETTINGS.version).toBe(SETTINGS_VERSION);
    expect(DEFAULT_SETTINGS.appearance).toMatchObject({ uiTheme: 'midnight', followSystem: true, zoom: 1 });
    expect(DEFAULT_SETTINGS.rendering).toMatchObject({ codeTheme: 'auto', elementStyle: 'modern' });
    expect(DEFAULT_SETTINGS.editor).toMatchObject({ defaultMode: 'wysiwyg', tabSize: 2, autoSave: 'off' });
    expect(DEFAULT_SETTINGS.general).toMatchObject({ confirmOnClose: true, showStatusBar: true });
  });
});

describe('parseSettings', () => {
  it('returns defaults for missing or non-object input', () => {
    for (const raw of [undefined, null, 42, 'settings', []])
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid data and fills in missing fields', () => {
    const parsed = parseSettings({ appearance: { zoom: 1.5 }, editor: { tabSize: 4 } });
    expect(parsed.appearance.zoom).toBe(1.5);
    expect(parsed.appearance.uiTheme).toBe('midnight');
    expect(parsed.editor.tabSize).toBe(4);
  });

  it('falls back field by field instead of dropping whole sections', () => {
    const parsed = parseSettings({
      appearance: { zoom: 99, uiTheme: 'nord', followSystem: 'yes' },
      editor: { tabSize: 4, defaultMode: 'visual' },
      general: 'broken',
    });
    expect(parsed.appearance).toMatchObject({ zoom: 1, uiTheme: 'nord', followSystem: true });
    expect(parsed.editor).toMatchObject({ tabSize: 4, defaultMode: 'wysiwyg' });
    expect(parsed.general).toEqual(DEFAULT_SETTINGS.general);
    expect(parsed.rendering).toEqual(DEFAULT_SETTINGS.rendering);
  });

  it('drops only the invalid entries of a list', () => {
    const parsed = parseSettings({
      version: SETTINGS_VERSION,
      appearance: { customUiThemes: [customTheme('one'), { id: 'Bad Id' }, customTheme('two')], zoom: 0 },
    });
    expect(parsed.appearance.customUiThemes.map((theme) => theme.id)).toEqual(['one', 'two']);
    expect(parsed.appearance.zoom).toBe(1);
  });

  it('falls back when a list stays invalid after filtering', () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => customTheme(`t${index}`));
    const parsed = parseSettings({ appearance: { customUiThemes: tooMany, zoom: 7 } });
    expect(parsed.appearance.customUiThemes).toEqual([]);
  });

  it('normalises an unknown version', () => {
    const parsed = parseSettings({ version: 99, editor: { wordWrap: false } });
    expect(parsed.version).toBe(SETTINGS_VERSION);
    expect(parsed.editor.wordWrap).toBe(false);
  });

  it('round-trips its own output', () => {
    const custom: Settings = applySettingsPatch(DEFAULT_SETTINGS, { general: { showOutline: true } });
    expect(parseSettings(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });
});

describe('applySettingsPatch', () => {
  it('merges partial sections', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      appearance: { uiTheme: 'nord' },
      rendering: { loadRemoteImages: false },
    });
    expect(next.appearance.uiTheme).toBe('nord');
    expect(next.appearance.zoom).toBe(DEFAULT_SETTINGS.appearance.zoom);
    expect(next.rendering.loadRemoteImages).toBe(false);
    expect(next.editor).toEqual(DEFAULT_SETTINGS.editor);
  });

  it('does not mutate the current settings', () => {
    const current = applySettingsPatch(DEFAULT_SETTINGS, {});
    applySettingsPatch(current, { editor: { tabSize: 8 } });
    expect(current.editor.tabSize).toBe(2);
  });

  it('throws a ZodError on invalid values', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { appearance: { zoom: 10 } })).toThrow(z.ZodError);
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { editor: { tabSize: 1.5 } })).toThrow(z.ZodError);
  });

  it('strips unknown keys', () => {
    const patch = { general: { showWelcome: false, unknownKey: 1 } } as unknown as Parameters<
      typeof applySettingsPatch
    >[1];
    const next = applySettingsPatch(DEFAULT_SETTINGS, patch);
    expect(next.general).not.toHaveProperty('unknownKey');
    expect(next.general.showWelcome).toBe(false);
  });
});
