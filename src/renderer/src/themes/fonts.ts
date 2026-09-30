/**
 * Bundles the variable fonts used by the UI ('Inter Variable') and for code
 * ('JetBrains Mono Variable'). Imported for its side effects by `themes/index.ts`;
 * the font files are served from the app bundle, never from a CDN.
 */
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

/** Font family names registered by the bundled @fontsource packages. */
export const BUNDLED_FONTS = Object.freeze({
  ui: 'Inter Variable',
  mono: 'JetBrains Mono Variable',
});
