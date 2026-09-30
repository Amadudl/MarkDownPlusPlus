import type { Settings, SettingsPatch } from '@shared/settings';
import type { CodeTheme, ElementStyle, UiTheme } from '@shared/theme-model';
import {
  BUILTIN_CODE_THEMES,
  BUILTIN_ELEMENT_STYLES,
  BUILTIN_UI_THEMES,
  createCustomCodeTheme,
  createCustomElementStyle,
  createCustomUiTheme,
  listCodeThemes,
  listElementStyles,
  listUiThemes,
  parseThemeImport,
  resolveTheme,
  serializeThemeExport,
} from '@renderer/themes';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';

/** Value of `rendering.codeTheme` that pairs the code theme with the UI theme. */
export const AUTO_CODE_THEME = 'auto';

function settings(): Settings {
  return useSettings.getState().settings;
}

function update(patch: SettingsPatch): Promise<boolean> {
  return useSettings.getState().update(patch);
}

function replaceById<T extends { readonly id: string }>(list: readonly T[], item: T): T[] {
  return list.map((entry) => (entry.id === item.id ? item : entry));
}

/** True when the id belongs to a built-in (read-only) preset. */
export function isBuiltinUiTheme(id: string): boolean {
  return BUILTIN_UI_THEMES.some((theme) => theme.id === id);
}
export function isBuiltinCodeTheme(id: string): boolean {
  return BUILTIN_CODE_THEMES.some((theme) => theme.id === id);
}
export function isBuiltinElementStyle(id: string): boolean {
  return BUILTIN_ELEMENT_STYLES.some((style) => style.id === id);
}

// ---------------------------------------------------------------- UI themes

/**
 * Activates a UI theme. While following the OS, a light theme becomes the light
 * pick and a dark theme the dark pick; otherwise it becomes the fixed theme.
 */
export function selectUiTheme(theme: UiTheme): Promise<boolean> {
  if (!settings().appearance.followSystem) return update({ appearance: { uiTheme: theme.id } });
  return update({ appearance: theme.kind === 'light' ? { lightTheme: theme.id } : { darkTheme: theme.id } });
}

/**
 * True when selecting the theme while following the OS only stores it for the other
 * appearance, i.e. it does not change what is on screen right now (a dark theme on a
 * light OS or a light theme on a dark OS).
 */
export function isDeferredUiThemePick(theme: UiTheme, followSystem: boolean, prefersDark: boolean): boolean {
  return followSystem && (theme.kind === 'dark') !== prefersDark;
}

/** Stops following the OS appearance and uses the theme right away. */
export function applyUiThemeNow(theme: UiTheme): Promise<boolean> {
  return update({ appearance: { followSystem: false, uiTheme: theme.id } });
}

/** Copies a theme into a new custom theme and activates it. */
export async function duplicateUiTheme(base: UiTheme): Promise<UiTheme> {
  const ids = listUiThemes(settings()).map((theme) => theme.id);
  const copy = createCustomUiTheme(base, `${base.name} Copy`, ids);
  await update({ appearance: { customUiThemes: [...settings().appearance.customUiThemes, copy] } });
  await selectUiTheme(copy);
  return copy;
}

/** Saves an edited custom UI theme. */
export function saveCustomUiTheme(theme: UiTheme): Promise<boolean> {
  return update({ appearance: { customUiThemes: replaceById(settings().appearance.customUiThemes, theme) } });
}

/** Deletes a custom UI theme; selections pointing to it fall back to the defaults. */
export function deleteCustomUiTheme(id: string): Promise<boolean> {
  const { appearance } = settings();
  const defaults = DEFAULT_SETTINGS.appearance;
  return update({
    appearance: {
      customUiThemes: appearance.customUiThemes.filter((theme) => theme.id !== id),
      uiTheme: appearance.uiTheme === id ? defaults.uiTheme : appearance.uiTheme,
      lightTheme: appearance.lightTheme === id ? defaults.lightTheme : appearance.lightTheme,
      darkTheme: appearance.darkTheme === id ? defaults.darkTheme : appearance.darkTheme,
    },
  });
}

// -------------------------------------------------------------- Code themes

/** Activates a code theme id or {@link AUTO_CODE_THEME}. */
export function selectCodeTheme(id: string): Promise<boolean> {
  return update({ rendering: { codeTheme: id } });
}

/** The code theme currently in effect (resolving `auto`). */
export function effectiveCodeTheme(): CodeTheme {
  return resolveTheme(settings(), useUi.getState().prefersDark).code;
}

export async function duplicateCodeTheme(base: CodeTheme, name = `${base.name} Copy`): Promise<CodeTheme> {
  const ids = listCodeThemes(settings()).map((theme) => theme.id);
  const copy = createCustomCodeTheme(base, name, ids);
  await update({
    rendering: { customCodeThemes: [...settings().rendering.customCodeThemes, copy], codeTheme: copy.id },
  });
  return copy;
}

export function saveCustomCodeTheme(theme: CodeTheme): Promise<boolean> {
  return update({
    rendering: { customCodeThemes: replaceById(settings().rendering.customCodeThemes, theme) },
  });
}

export function deleteCustomCodeTheme(id: string): Promise<boolean> {
  const { rendering } = settings();
  return update({
    rendering: {
      customCodeThemes: rendering.customCodeThemes.filter((theme) => theme.id !== id),
      codeTheme: rendering.codeTheme === id ? AUTO_CODE_THEME : rendering.codeTheme,
    },
  });
}

/**
 * Changes a flag of the active code theme. Built-in themes are never modified:
 * a custom copy is created (and activated) first.
 */
export async function setCodeThemeFlag(
  flag: 'italicComments' | 'boldKeywords',
  value: boolean,
): Promise<void> {
  const current = effectiveCodeTheme();
  if (current[flag] === value) return;
  if (isBuiltinCodeTheme(current.id)) {
    const copy = await duplicateCodeTheme(current, `${current.name} (Custom)`);
    await saveCustomCodeTheme({ ...copy, [flag]: value });
    return;
  }
  await saveCustomCodeTheme({ ...current, [flag]: value });
}

// ----------------------------------------------------------- Element styles

export function selectElementStyle(id: string): Promise<boolean> {
  return update({ rendering: { elementStyle: id } });
}

/** The element style currently in effect. */
export function effectiveElementStyle(): ElementStyle {
  return resolveTheme(settings(), useUi.getState().prefersDark).elements;
}

export async function duplicateElementStyle(
  base: ElementStyle,
  name = `${base.name} Copy`,
): Promise<ElementStyle> {
  const ids = listElementStyles(settings()).map((style) => style.id);
  const copy = createCustomElementStyle(base, name, ids);
  await update({
    rendering: {
      customElementStyles: [...settings().rendering.customElementStyles, copy],
      elementStyle: copy.id,
    },
  });
  return copy;
}

export function saveCustomElementStyle(style: ElementStyle): Promise<boolean> {
  return update({
    rendering: { customElementStyles: replaceById(settings().rendering.customElementStyles, style) },
  });
}

export function deleteCustomElementStyle(id: string): Promise<boolean> {
  const { rendering } = settings();
  return update({
    rendering: {
      customElementStyles: rendering.customElementStyles.filter((style) => style.id !== id),
      elementStyle:
        rendering.elementStyle === id ? DEFAULT_SETTINGS.rendering.elementStyle : rendering.elementStyle,
    },
  });
}

/**
 * Applies an edit to the active element style. Editing a built-in preset first
 * creates (and activates) a custom copy, so presets always stay pristine.
 */
export async function editElementStyle(edit: (style: ElementStyle) => ElementStyle): Promise<void> {
  const current = effectiveElementStyle();
  if (isBuiltinElementStyle(current.id)) {
    const copy = await duplicateElementStyle(current, `${current.name} (Custom)`);
    await saveCustomElementStyle(edit(copy));
    return;
  }
  await saveCustomElementStyle(edit(current));
}

// ------------------------------------------------------- Import and export

/** What an import added. */
export type ImportedTheme =
  | { readonly kind: 'ui'; readonly theme: UiTheme }
  | { readonly kind: 'code'; readonly theme: CodeTheme }
  | { readonly kind: 'elements'; readonly theme: ElementStyle };

/**
 * Imports a theme JSON file of any kind, gives it a unique id when it collides
 * with an existing one, stores and activates it.
 * @throws Error with a readable message for invalid files.
 */
export async function importTheme(json: string): Promise<ImportedTheme> {
  const parsed = parseThemeImport(json);
  const current = settings();
  if (parsed.kind === 'ui') {
    const ids = listUiThemes(current).map((theme) => theme.id);
    const theme = ids.includes(parsed.theme.id)
      ? createCustomUiTheme(parsed.theme, parsed.theme.name, ids)
      : parsed.theme;
    await update({ appearance: { customUiThemes: [...current.appearance.customUiThemes, theme] } });
    await selectUiTheme(theme);
    return { kind: 'ui', theme };
  }
  if (parsed.kind === 'code') {
    const ids = listCodeThemes(current).map((theme) => theme.id);
    const theme = ids.includes(parsed.theme.id)
      ? createCustomCodeTheme(parsed.theme, parsed.theme.name, ids)
      : parsed.theme;
    await update({
      rendering: { customCodeThemes: [...current.rendering.customCodeThemes, theme], codeTheme: theme.id },
    });
    return { kind: 'code', theme };
  }
  const ids = listElementStyles(current).map((style) => style.id);
  const theme = ids.includes(parsed.theme.id)
    ? createCustomElementStyle(parsed.theme, parsed.theme.name, ids)
    : parsed.theme;
  await update({
    rendering: {
      customElementStyles: [...current.rendering.customElementStyles, theme],
      elementStyle: theme.id,
    },
  });
  return { kind: 'elements', theme };
}

/** Offers a theme as a JSON download (`<id>.json`). */
export function downloadTheme(theme: UiTheme | CodeTheme | ElementStyle): void {
  const blob = new Blob([serializeThemeExport(theme)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${theme.id}.json`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
