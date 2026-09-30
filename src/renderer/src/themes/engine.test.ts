import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, applySettingsPatch, type Settings } from '@shared/settings';
import { elementStyleSchema, type CodeTheme, type ElementStyle, type UiTheme } from '@shared/theme-model';
import {
  AUTO_CODE_THEME,
  applyTheme,
  listCodeThemes,
  listElementStyles,
  listUiThemes,
  resolveTheme,
  sanitizeFontFamily,
  themeRootAttributes,
  themeToCssVariables,
  toKebabCase,
  type ResolvedTheme,
} from './engine';
import { BUILTIN_CODE_THEMES } from './presets/code-themes';
import { BUILTIN_ELEMENT_STYLES } from './presets/element-styles';
import { BUILTIN_UI_THEMES } from './presets/ui-themes';

const byId = <T extends { id: string }>(items: readonly T[], id: string): T => {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

const customUi: UiTheme = { ...byId(BUILTIN_UI_THEMES, 'daylight'), id: 'custom-sunrise', name: 'Sunrise' };
const customCode: CodeTheme = { ...byId(BUILTIN_CODE_THEMES, 'dracula'), id: 'custom-vamp', name: 'Vamp' };
const customElements: ElementStyle = {
  ...byId(BUILTIN_ELEMENT_STYLES, 'book'),
  id: 'custom-novel',
  name: 'Novel',
};

function withSettings(patch: Parameters<typeof applySettingsPatch>[1]): Settings {
  return applySettingsPatch(DEFAULT_SETTINGS, patch);
}

const midnight = (): ResolvedTheme => resolveTheme(DEFAULT_SETTINGS, true);

describe('list*', () => {
  it('returns built-ins followed by custom themes', () => {
    const settings = withSettings({
      appearance: { customUiThemes: [customUi] },
      rendering: { customCodeThemes: [customCode], customElementStyles: [customElements] },
    });
    expect(listUiThemes(settings)).toEqual([...BUILTIN_UI_THEMES, customUi]);
    expect(listCodeThemes(settings)).toEqual([...BUILTIN_CODE_THEMES, customCode]);
    expect(listElementStyles(settings)).toEqual([...BUILTIN_ELEMENT_STYLES, customElements]);
  });

  it('never lets a custom theme shadow a built-in or an earlier custom theme', () => {
    const impostor: UiTheme = { ...customUi, id: 'midnight', name: 'Evil Midnight' };
    const duplicate: UiTheme = { ...customUi, name: 'Second' };
    const settings = withSettings({ appearance: { customUiThemes: [impostor, customUi, duplicate] } });
    const list = listUiThemes(settings);
    expect(list.filter((theme) => theme.id === 'midnight')).toEqual([byId(BUILTIN_UI_THEMES, 'midnight')]);
    expect(list.filter((theme) => theme.id === customUi.id)).toEqual([customUi]);
  });
});

describe('resolveTheme', () => {
  it('follows the system by default: Midnight when dark, Daylight when light', () => {
    expect(resolveTheme(DEFAULT_SETTINGS, true).ui.id).toBe('midnight');
    expect(resolveTheme(DEFAULT_SETTINGS, false).ui.id).toBe('daylight');
  });

  it('uses the configured light/dark themes when following the system', () => {
    const settings = withSettings({ appearance: { lightTheme: 'paper', darkTheme: 'nord' } });
    expect(resolveTheme(settings, true).ui.id).toBe('nord');
    expect(resolveTheme(settings, false).ui.id).toBe('paper');
  });

  it('uses appearance.uiTheme when not following the system', () => {
    const settings = withSettings({ appearance: { followSystem: false, uiTheme: 'gruvbox-light' } });
    expect(resolveTheme(settings, true).ui.id).toBe('gruvbox-light');
    expect(resolveTheme(settings, false).ui.id).toBe('gruvbox-light');
  });

  it('resolves custom themes of every layer', () => {
    const settings = withSettings({
      appearance: { followSystem: false, uiTheme: customUi.id, customUiThemes: [customUi] },
      rendering: {
        codeTheme: customCode.id,
        customCodeThemes: [customCode],
        elementStyle: customElements.id,
        customElementStyles: [customElements],
      },
    });
    expect(resolveTheme(settings, true)).toEqual({
      ui: customUi,
      code: customCode,
      elements: customElements,
    });
  });

  it('falls back to the defaults for unknown ids', () => {
    const settings = withSettings({
      appearance: { followSystem: false, uiTheme: 'does-not-exist' },
      rendering: { codeTheme: 'nope', elementStyle: 'gone' },
    });
    const dark = resolveTheme(settings, true);
    expect(dark.ui.id).toBe('midnight');
    expect(dark.code.id).toBe('tokyo-night');
    expect(dark.elements.id).toBe('modern');
    expect(resolveTheme(settings, false).ui.id).toBe('daylight');
    const followUnknown = withSettings({ appearance: { lightTheme: 'x', darkTheme: 'y' } });
    expect(resolveTheme(followUnknown, true).ui.id).toBe('midnight');
    expect(resolveTheme(followUnknown, false).ui.id).toBe('daylight');
  });

  it('pairs the code theme with the UI theme for "auto"', () => {
    expect(DEFAULT_SETTINGS.rendering.codeTheme).toBe(AUTO_CODE_THEME);
    const settings = (ui: string): Settings =>
      withSettings({ appearance: { followSystem: false, uiTheme: ui } });
    expect(resolveTheme(settings('dracula'), true).code.id).toBe('dracula');
    expect(resolveTheme(settings('daylight'), true).code.id).toBe('github-light');
    expect(resolveTheme(settings('solarized-light'), true).code.id).toBe('solarized-light');
  });

  it('pairs custom UI themes by kind for "auto"', () => {
    const dark: UiTheme = { ...byId(BUILTIN_UI_THEMES, 'midnight'), id: 'custom-dark', name: 'Dark' };
    const settings = withSettings({
      appearance: { followSystem: false, uiTheme: 'custom-dark', customUiThemes: [dark, customUi] },
    });
    expect(resolveTheme(settings, true).code.id).toBe('one-dark-pro');
    const light = withSettings({
      appearance: { followSystem: false, uiTheme: customUi.id, customUiThemes: [customUi] },
    });
    expect(resolveTheme(light, true).code.id).toBe('github-light');
  });

  it('uses an explicitly chosen built-in code theme regardless of the UI theme', () => {
    const settings = withSettings({ rendering: { codeTheme: 'monokai', elementStyle: 'academic' } });
    const theme = resolveTheme(settings, false);
    expect(theme.code.id).toBe('monokai');
    expect(theme.elements.id).toBe('academic');
  });
});

describe('toKebabCase', () => {
  it('converts camelCase keys and digits', () => {
    expect(toKebabCase('surfaceElevated')).toBe('surface-elevated');
    expect(toKebabCase('controlKeyword')).toBe('control-keyword');
    expect(toKebabCase('background')).toBe('background');
    expect(toKebabCase('h1Size')).toBe('h-1-size');
  });
});

describe('sanitizeFontFamily', () => {
  it('keeps legitimate font stacks untouched', () => {
    const stack = '\'Iowan Old Style\', "Palatino Linotype", Charter, system-ui, sans-serif';
    expect(sanitizeFontFamily(stack, 'x')).toBe(stack);
    expect(sanitizeFontFamily('Noto Sans CJK JP, 游ゴシック', 'x')).toBe('Noto Sans CJK JP, 游ゴシック');
  });

  it('strips characters that could break out of a declaration', () => {
    expect(sanitizeFontFamily('Inter; } body { background: url(evil) }', 'x')).toBe(
      'Inter body background urlevil',
    );
    expect(sanitizeFontFamily('</style><script>alert(1)</script>', 'x')).toBe('stylescriptalert1script');
  });

  it('removes unbalanced quotes', () => {
    expect(sanitizeFontFamily("'Inter, sans-serif", 'x')).toBe('Inter, sans-serif');
    expect(sanitizeFontFamily('"Inter", "Mono', 'x')).toBe('Inter, Mono');
  });

  it('returns the fallback when nothing usable remains', () => {
    expect(sanitizeFontFamily('  ;{}<>  ', 'fallback')).toBe('fallback');
    expect(sanitizeFontFamily("''", 'fallback')).toBe('fallback');
  });
});

describe('themeToCssVariables', () => {
  it('maps every UI and code colour to a kebab-case variable', () => {
    const theme = midnight();
    const vars = themeToCssVariables(theme);
    expect(vars['--mpp-ui-surface-elevated']).toBe(theme.ui.colors.surfaceElevated);
    expect(vars['--mpp-ui-editor-background']).toBe(theme.ui.colors.editorBackground);
    expect(vars['--mpp-code-control-keyword']).toBe(theme.code.colors.controlKeyword);
    expect(vars['--mpp-code-class-name']).toBe(theme.code.colors.className);
    for (const key of Object.keys(theme.ui.colors))
      expect(vars).toHaveProperty(`--mpp-ui-${toKebabCase(key)}`);
    for (const key of Object.keys(theme.code.colors)) {
      expect(vars).toHaveProperty(`--mpp-code-${toKebabCase(key)}`);
    }
  });

  it('derives shadows from the UI theme kind', () => {
    const dark = themeToCssVariables(resolveTheme(DEFAULT_SETTINGS, true));
    const light = themeToCssVariables(resolveTheme(DEFAULT_SETTINGS, false));
    expect(dark['--mpp-ui-shadow-md']).not.toBe(light['--mpp-ui-shadow-md']);
    expect(dark['--mpp-ui-backdrop']).toMatch(/^rgb\(/);
  });

  it('encodes code font flags', () => {
    const base = midnight();
    const italicBold = themeToCssVariables({
      ...base,
      code: { ...base.code, italicComments: true, boldKeywords: true },
    });
    expect(italicBold['--mpp-code-comment-style']).toBe('italic');
    expect(italicBold['--mpp-code-keyword-weight']).toBe('700');
    const plain = themeToCssVariables({
      ...base,
      code: { ...base.code, italicComments: false, boldKeywords: false },
    });
    expect(plain['--mpp-code-comment-style']).toBe('normal');
    expect(plain['--mpp-code-keyword-weight']).toBe('400');
  });

  it('converts the element style to typed CSS values', () => {
    const vars = themeToCssVariables(midnight());
    const modern = byId(BUILTIN_ELEMENT_STYLES, 'modern');
    expect(vars).toMatchObject({
      '--mpp-el-body-font': modern.typography.bodyFont,
      '--mpp-el-mono-font': modern.typography.monoFont,
      '--mpp-el-base-font-size': '16px',
      '--mpp-el-line-height': '1.7',
      '--mpp-el-paragraph-spacing': '1em',
      '--mpp-el-content-width': '780px',
      '--mpp-el-h1-size': '2.25em',
      '--mpp-el-h6-size': '0.875em',
      '--mpp-el-heading-weight': '700',
      '--mpp-el-heading-letter-spacing': '-0.02em',
      '--mpp-el-heading-color': 'var(--mpp-ui-heading)',
      '--mpp-el-code-radius': '12px',
      '--mpp-el-code-font-size': '0.875em',
      '--mpp-el-list-spacing': '0.35em',
      '--mpp-el-image-radius': '12px',
    });
  });

  it.each([
    ['accent', 'var(--mpp-ui-accent)'],
    ['text', 'var(--mpp-ui-editor-text)'],
  ] as const)('maps heading colour %s', (color, expected) => {
    const base = midnight();
    const vars = themeToCssVariables({
      ...base,
      elements: { ...base.elements, headings: { ...base.elements.headings, color } },
    });
    expect(vars['--mpp-el-heading-color']).toBe(expected);
  });

  it('defends against invalid values that bypassed validation', () => {
    const base = midnight();
    const hostile = {
      ...base,
      ui: { ...base.ui, colors: { ...base.ui.colors, accent: 'red; } * { display: none' } },
      code: { ...base.code, colors: { ...base.code.colors, keyword: 'url(javascript:alert(1))' } },
      elements: {
        ...base.elements,
        typography: { ...base.elements.typography, bodyFont: '{}', lineHeight: Number.NaN },
        headings: { ...base.elements.headings, scale: [Infinity, 2, 1.5, 1.2, 1, 1] },
      },
    } as unknown as ResolvedTheme;
    const vars = themeToCssVariables(hostile);
    expect(vars['--mpp-ui-accent']).toBe('#808080');
    expect(vars['--mpp-code-keyword']).toBe('#808080');
    expect(vars['--mpp-el-body-font']).toContain('Inter Variable');
    expect(vars['--mpp-el-line-height']).toBe('1.6');
    expect(vars['--mpp-el-h1-size']).toBe('1em');
    for (const value of Object.values(vars)) expect(value).not.toMatch(/[;{}<>]/);
  });

  it('rounds numbers to at most four decimals', () => {
    const base = midnight();
    const vars = themeToCssVariables({
      ...base,
      elements: { ...base.elements, typography: { ...base.elements.typography, lineHeight: 1.234567 } },
    });
    expect(vars['--mpp-el-line-height']).toBe('1.2346');
  });

  it('produces the same set of variable names for every built-in combination', () => {
    const names = Object.keys(themeToCssVariables(midnight())).sort();
    for (const ui of BUILTIN_UI_THEMES) {
      const theme = { ...midnight(), ui };
      expect(Object.keys(themeToCssVariables(theme)).sort()).toEqual(names);
    }
  });
});

describe('themeRootAttributes', () => {
  it('describes every variant of the theme', () => {
    const attrs = themeRootAttributes(midnight());
    expect(attrs).toEqual({
      'data-mpp-theme-kind': 'dark',
      'data-mpp-code-kind': 'dark',
      'data-mpp-ui-theme': 'midnight',
      'data-mpp-code-theme': 'tokyo-night',
      'data-mpp-element-style': 'modern',
      'data-mpp-quote': 'card',
      'data-mpp-quote-italic': 'false',
      'data-mpp-codeblock': 'shadow',
      'data-mpp-code-line-numbers': 'false',
      'data-mpp-code-show-language': 'true',
      'data-mpp-inline-code': 'pill',
      'data-mpp-table': 'striped',
      'data-mpp-table-compact': 'false',
      'data-mpp-bullet': 'disc',
      'data-mpp-link': 'accent',
      'data-mpp-hr': 'fade',
      'data-mpp-heading-underline': 'none',
      'data-mpp-heading-color': 'heading',
      'data-mpp-uppercase-small': 'false',
      'data-mpp-image-centered': 'true',
      'data-mpp-image-shadow': 'true',
    });
  });

  it('reflects boolean flags as "true"/"false"', () => {
    const settings = withSettings({ rendering: { elementStyle: 'typewriter' } });
    const attrs = themeRootAttributes(resolveTheme(settings, false));
    expect(attrs['data-mpp-theme-kind']).toBe('light');
    expect(attrs['data-mpp-code-line-numbers']).toBe('true');
    expect(attrs['data-mpp-uppercase-small']).toBe('true');
    expect(attrs['data-mpp-image-centered']).toBe('false');
    expect(attrs['data-mpp-bullet']).toBe('dash');
    expect(elementStyleSchema.shape.list.shape.bullet.options).toContain(attrs['data-mpp-bullet']);
  });
});

describe('applyTheme', () => {
  it('sets variables, attributes and color-scheme on the root', () => {
    const root = document.createElement('div');
    const theme = midnight();
    applyTheme(root, theme);
    expect(root.style.getPropertyValue('--mpp-ui-accent')).toBe(theme.ui.colors.accent);
    expect(root.style.getPropertyValue('--mpp-el-h1-size')).toBe('2.25em');
    expect(root.getAttribute('data-mpp-quote')).toBe('card');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('replaces the previous theme and removes stale --mpp- variables only', () => {
    const root = document.createElement('div');
    root.style.setProperty('--mpp-legacy', '1');
    root.style.setProperty('--other-app', 'keep');
    root.style.setProperty('margin', '4px');
    applyTheme(root, midnight());
    const light = resolveTheme(withSettings({ rendering: { elementStyle: 'github' } }), false);
    applyTheme(root, light);
    expect(root.style.getPropertyValue('--mpp-legacy')).toBe('');
    expect(root.style.getPropertyValue('--other-app')).toBe('keep');
    expect(root.style.margin).toBe('4px');
    expect(root.style.getPropertyValue('--mpp-ui-editor-background')).toBe(light.ui.colors.editorBackground);
    expect(root.getAttribute('data-mpp-quote')).toBe('bar');
    expect(root.getAttribute('data-mpp-theme-kind')).toBe('light');
    expect(root.style.colorScheme).toBe('light');
  });
});
