import type { EditorSettings, EditorWidthMode } from '@shared/settings';

/**
 * CSS custom property that overrides the text column width of both editors. The
 * stylesheets read it as `var(--mpp-editor-column-width, var(--mpp-el-content-width))`,
 * so leaving it unset keeps the content width of the active element style. It is set
 * on the editor area only, which keeps exports (they never see the editor DOM) on the
 * theme width.
 */
export const COLUMN_WIDTH_VAR = '--mpp-editor-column-width';

/**
 * The value of {@link COLUMN_WIDTH_VAR} for the width settings, or `undefined` to use
 * the theme width.
 *
 * - `full`: `100%`. The column's max-width (`100%` plus the gutter or line padding)
 *   is then never smaller than the editor area, so the text spans it minus the gutter.
 * - `custom`: the custom width in px. Like every max-width it never exceeds the window.
 */
export function columnWidthValue(
  editor: Pick<EditorSettings, 'widthMode' | 'customWidth'>,
): string | undefined {
  switch (editor.widthMode) {
    case 'full':
      return '100%';
    case 'custom':
      return `${Math.round(editor.customWidth)}px`;
    case 'theme':
      return undefined;
  }
}

/** Width modes that are restored when full width is toggled off. */
export type NarrowWidthMode = Exclude<EditorWidthMode, 'full'>;

/**
 * The width mode after toggling full width: `full` from any other mode, and back to
 * `previous` (the mode that was active before full width) from `full`.
 */
export function toggledWidthMode(current: EditorWidthMode, previous: NarrowWidthMode): EditorWidthMode {
  return current === 'full' ? previous : 'full';
}
