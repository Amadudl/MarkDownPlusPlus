import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_CODE_THEMES,
  BUILTIN_ELEMENT_STYLES,
  BUILTIN_UI_THEMES,
  serializeThemeExport,
} from '@renderer/themes';
import type { FakeApi } from '@renderer/test/fakeApi';
import { resetApp, setSettings } from '@renderer/test/utils';
import { useSettings } from '@renderer/store/settings';
import {
  AUTO_CODE_THEME,
  applyUiThemeNow,
  deleteCustomCodeTheme,
  deleteCustomElementStyle,
  deleteCustomUiTheme,
  downloadTheme,
  duplicateCodeTheme,
  duplicateElementStyle,
  duplicateUiTheme,
  editElementStyle,
  effectiveCodeTheme,
  effectiveElementStyle,
  importTheme,
  isBuiltinCodeTheme,
  isBuiltinElementStyle,
  isBuiltinUiTheme,
  isDeferredUiThemePick,
  saveCustomCodeTheme,
  saveCustomElementStyle,
  saveCustomUiTheme,
  selectCodeTheme,
  selectElementStyle,
  selectUiTheme,
  setCodeThemeFlag,
} from './themeActions';

const current = (): ReturnType<typeof useSettings.getState>['settings'] => useSettings.getState().settings;
const light = BUILTIN_UI_THEMES.find((theme) => theme.kind === 'light')!;
const dark = BUILTIN_UI_THEMES.find((theme) => theme.kind === 'dark')!;

describe('theme actions', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
  });

  it('knows built-in ids', () => {
    expect(isBuiltinUiTheme(dark.id)).toBe(true);
    expect(isBuiltinUiTheme('custom-x')).toBe(false);
    expect(isBuiltinCodeTheme(BUILTIN_CODE_THEMES[0]!.id)).toBe(true);
    expect(isBuiltinElementStyle(BUILTIN_ELEMENT_STYLES[0]!.id)).toBe(true);
  });

  it('selects UI themes for the right slot', async () => {
    await selectUiTheme(light);
    await selectUiTheme(dark);
    expect(current().appearance).toMatchObject({ lightTheme: light.id, darkTheme: dark.id });
    setSettings(api, { appearance: { followSystem: false } });
    await selectUiTheme(light);
    expect(current().appearance.uiTheme).toBe(light.id);
  });

  it('recognises picks that only apply to the other system appearance', () => {
    expect(isDeferredUiThemePick(dark, true, false)).toBe(true);
    expect(isDeferredUiThemePick(light, true, true)).toBe(true);
    expect(isDeferredUiThemePick(dark, true, true)).toBe(false);
    expect(isDeferredUiThemePick(light, true, false)).toBe(false);
    expect(isDeferredUiThemePick(dark, false, false)).toBe(false);
  });

  it('uses a theme right away by no longer following the system', async () => {
    await applyUiThemeNow(dark);
    expect(current().appearance).toMatchObject({ followSystem: false, uiTheme: dark.id });
  });

  it('duplicates, edits and deletes custom UI themes', async () => {
    const copy = await duplicateUiTheme(dark);
    expect(copy.id).toMatch(/^custom-/);
    expect(current().appearance.customUiThemes).toHaveLength(1);
    expect(current().appearance.darkTheme).toBe(copy.id);
    const sibling = await duplicateUiTheme(light);
    await saveCustomUiTheme({ ...copy, name: 'Renamed' });
    expect(current().appearance.customUiThemes.map((theme) => theme.name)).toEqual(['Renamed', sibling.name]);
    await deleteCustomUiTheme(sibling.id);
    setSettings(api, { appearance: { uiTheme: copy.id, lightTheme: copy.id } });
    await deleteCustomUiTheme(copy.id);
    expect(current().appearance).toMatchObject({
      customUiThemes: [],
      uiTheme: 'midnight',
      lightTheme: 'daylight',
      darkTheme: 'midnight',
    });
    const other = await duplicateUiTheme(light);
    setSettings(api, { appearance: { uiTheme: dark.id, lightTheme: light.id, darkTheme: dark.id } });
    await deleteCustomUiTheme(other.id);
    expect(current().appearance).toMatchObject({
      uiTheme: dark.id,
      lightTheme: light.id,
      darkTheme: dark.id,
    });
  });

  it('manages code themes including flags on built-ins', async () => {
    const auto = effectiveCodeTheme();
    expect(isBuiltinCodeTheme(auto.id)).toBe(true);
    await setCodeThemeFlag('italicComments', auto.italicComments);
    expect(current().rendering.customCodeThemes).toHaveLength(0);
    await setCodeThemeFlag('boldKeywords', !auto.boldKeywords);
    const custom = current().rendering.customCodeThemes[0]!;
    expect(custom.name).toBe(`${auto.name} (Custom)`);
    expect(custom.boldKeywords).toBe(!auto.boldKeywords);
    expect(current().rendering.codeTheme).toBe(custom.id);
    await setCodeThemeFlag('italicComments', !custom.italicComments);
    expect(current().rendering.customCodeThemes).toHaveLength(1);
    expect(current().rendering.customCodeThemes[0]?.italicComments).toBe(!custom.italicComments);
    await saveCustomCodeTheme({ ...custom, name: 'Mine' });
    expect(current().rendering.customCodeThemes[0]?.name).toBe('Mine');
    const second = await duplicateCodeTheme(BUILTIN_CODE_THEMES[0]!);
    expect(second.name).toBe(`${BUILTIN_CODE_THEMES[0]!.name} Copy`);
    await selectCodeTheme(custom.id);
    await deleteCustomCodeTheme(second.id);
    expect(current().rendering.codeTheme).toBe(custom.id);
    await deleteCustomCodeTheme(custom.id);
    expect(current().rendering.codeTheme).toBe(AUTO_CODE_THEME);
  });

  it('edits element styles through a custom copy', async () => {
    const base = effectiveElementStyle();
    await editElementStyle((style) => ({
      ...style,
      table: { ...style.table, compact: !style.table.compact },
    }));
    const custom = current().rendering.customElementStyles[0]!;
    expect(custom.name).toBe(`${base.name} (Custom)`);
    expect(current().rendering.elementStyle).toBe(custom.id);
    await editElementStyle((style) => ({ ...style, list: { ...style.list, spacing: 1 } }));
    expect(current().rendering.customElementStyles).toHaveLength(1);
    expect(current().rendering.customElementStyles[0]?.list.spacing).toBe(1);
    await saveCustomElementStyle({ ...current().rendering.customElementStyles[0]!, name: 'Tuned' });
    const extra = await duplicateElementStyle(BUILTIN_ELEMENT_STYLES[0]!);
    await selectElementStyle(custom.id);
    await deleteCustomElementStyle(extra.id);
    expect(current().rendering.elementStyle).toBe(custom.id);
    await deleteCustomElementStyle(custom.id);
    expect(current().rendering.elementStyle).toBe('modern');
  });

  it('imports themes of every kind with unique ids', async () => {
    const ui = await importTheme(serializeThemeExport(dark));
    expect(ui.kind).toBe('ui');
    expect(ui.theme.id).not.toBe(dark.id);
    const fresh = await importTheme(serializeThemeExport({ ...dark, id: 'brand-new', name: 'Brand' }));
    expect(fresh.theme.id).toBe('brand-new');
    const code = await importTheme(serializeThemeExport(BUILTIN_CODE_THEMES[0]!));
    expect(code.kind).toBe('code');
    expect(current().rendering.codeTheme).toBe(code.theme.id);
    const freshCode = await importTheme(serializeThemeExport({ ...BUILTIN_CODE_THEMES[0]!, id: 'new-code' }));
    expect(freshCode.theme.id).toBe('new-code');
    const elements = await importTheme(serializeThemeExport(BUILTIN_ELEMENT_STYLES[0]!));
    expect(elements.kind).toBe('elements');
    expect(current().rendering.elementStyle).toBe(elements.theme.id);
    const freshElements = await importTheme(
      serializeThemeExport({ ...BUILTIN_ELEMENT_STYLES[0]!, id: 'new-style' }),
    );
    expect(freshElements.theme.id).toBe('new-style');
    await expect(importTheme('{ not json')).rejects.toThrow();
  });

  it('downloads a theme as JSON', () => {
    const createObjectURL = vi.fn(() => 'blob:theme');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.useFakeTimers();
    downloadTheme(dark);
    expect(click).toHaveBeenCalled();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(`${dark.id}.json`);
    expect(anchor.isConnected).toBe(false);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:theme');
    vi.useRealTimers();
    click.mockRestore();
  });
});
