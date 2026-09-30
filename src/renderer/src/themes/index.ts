/**
 * Public API of the MarkDown++ theme system.
 *
 * Importing this module also installs the global theme stylesheets (design tokens
 * with Midnight defaults, the Crepe bridge, element styles, `.tok-*` classes) and
 * the bundled fonts, so the app never renders unstyled.
 */
import './fonts';
import './css/tokens.css';
import './css/crepe-bridge.css';
import './css/elements.css';
import './css/tokens-classes.css';

export { contrastRatio, mixColors, parseHexColor } from './color';
export type { Rgba } from './color';
export {
  AUTO_CODE_THEME,
  applyTheme,
  listCodeThemes,
  listElementStyles,
  listUiThemes,
  resolveTheme,
  sanitizeFontFamily,
  themeRootAttributes,
  themeToCssVariables,
} from './engine';
export type { ResolvedTheme } from './engine';
export { ELEMENT_PREVIEW_CSS, elementPreviewScope } from './element-preview';
export type { ElementPreviewScope } from './element-preview';
export { buildExportCss } from './export-css';
export type { ExportCss } from './export-css';
export { buildExportFontCss } from './export-fonts';
export { createCustomCodeTheme, createCustomElementStyle, createCustomUiTheme } from './custom-themes';
export { detectThemeLayer, parseThemeImport, serializeThemeExport } from './theme-io';
export type { ThemeImport, ThemeLayer } from './theme-io';
export { AUTO_CODE_THEME_PAIRING, autoCodeThemeId } from './presets/code-pairing';
export { BUILTIN_CODE_THEMES } from './presets/code-themes';
export { BUILTIN_ELEMENT_STYLES, DEFAULT_ELEMENT_STYLE } from './presets/element-styles';
export { BUILTIN_UI_THEMES, DEFAULT_DARK_UI_THEME, DEFAULT_LIGHT_UI_THEME } from './presets/ui-themes';
export { mppTokenHighlighter } from './token-highlighter';
