import type { JSX } from 'react';
import { Trash2 } from 'lucide-react';
import type { ThemeKind } from '@shared/theme-model';
import { contrastRatio } from '@renderer/themes';
import { ConfirmButton } from './ConfirmButton';
import { humanizeKey } from './colorInput';
import { ColorField, SelectField, SettingRow, TextField } from './controls';

/** The common shape of UI and code themes. */
export interface EditableColorTheme {
  readonly id: string;
  readonly name: string;
  readonly kind: ThemeKind;
  readonly colors: Readonly<Record<string, string>>;
}

export interface ColorGroup {
  readonly title: string;
  readonly keys: readonly string[];
}

/** A foreground/background pair checked against a minimum WCAG contrast ratio. */
export interface ContrastPair {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}

/** Contrast warning for a colour key, or null when every pair it is part of is fine. */
export function contrastWarning(
  colors: Readonly<Record<string, string>>,
  key: string,
  pairs: readonly ContrastPair[],
): string | null {
  for (const pair of pairs) {
    if (pair.foreground !== key) continue;
    const foreground = colors[pair.foreground];
    const background = colors[pair.background];
    if (foreground === undefined || background === undefined) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio < pair.minimum) {
      return `Contrast ${ratio.toFixed(2)}:1 on ${humanizeKey(pair.background).toLowerCase()} — WCAG recommends at least ${pair.minimum}:1.`;
    }
  }
  return null;
}

/** Editor for every colour of a custom UI or code theme. */
export function ColorThemeEditor<T extends EditableColorTheme>({
  theme,
  groups,
  contrastPairs,
  onSave,
  onDelete,
}: {
  readonly theme: T;
  readonly groups: readonly ColorGroup[];
  readonly contrastPairs: readonly ContrastPair[];
  readonly onSave: (theme: T) => void;
  readonly onDelete: () => void;
}): JSX.Element {
  const setColor = (key: string, value: string): void => {
    onSave({ ...theme, colors: { ...theme.colors, [key]: value } });
  };
  return (
    <div className="theme-editor">
      <SettingRow label="Name" htmlFor={`${theme.id}-name`}>
        <TextField
          id={`${theme.id}-name`}
          label="Theme name"
          value={theme.name}
          maxLength={64}
          onCommit={(name) => onSave({ ...theme, name })}
        />
      </SettingRow>
      <SettingRow label="Kind" description="Used to pick the theme when following the system appearance.">
        <SelectField<ThemeKind>
          label="Theme kind"
          value={theme.kind}
          choices={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={(kind) => onSave({ ...theme, kind })}
        />
      </SettingRow>
      {groups.map((group) => (
        <fieldset key={group.title} className="theme-editor-group">
          <legend>{group.title}</legend>
          <div className="theme-editor-grid">
            {group.keys.map((key) => (
              <ColorField
                key={key}
                label={humanizeKey(key)}
                value={theme.colors[key] ?? '#000000'}
                warning={contrastWarning(theme.colors, key, contrastPairs)}
                onChange={(value) => setColor(key, value)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="theme-editor-actions">
        <ConfirmButton confirmLabel={`Delete “${theme.name}”`} onConfirm={onDelete}>
          <Trash2 size={14} aria-hidden="true" /> Delete theme
        </ConfirmButton>
      </div>
    </div>
  );
}

/** Colour groups of UI themes. */
export const UI_COLOR_GROUPS: readonly ColorGroup[] = [
  {
    title: 'Window & surfaces',
    keys: ['background', 'surface', 'surfaceElevated', 'surfaceSunken', 'border', 'borderStrong'],
  },
  { title: 'Text', keys: ['text', 'textMuted', 'textFaint'] },
  {
    title: 'Accent & states',
    keys: ['accent', 'accentHover', 'accentText', 'selection', 'focusRing', 'danger', 'warning', 'success'],
  },
  {
    title: 'Document',
    keys: [
      'editorBackground',
      'editorText',
      'heading',
      'link',
      'mark',
      'quoteBar',
      'quoteBackground',
      'inlineCodeBackground',
      'inlineCodeText',
      'tableBorder',
      'tableHeaderBackground',
      'tableStripe',
    ],
  },
];

/** Contrast checks of UI themes. */
export const UI_CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'text', background: 'background', minimum: 4.5 },
  { foreground: 'textMuted', background: 'surface', minimum: 4.5 },
  { foreground: 'textFaint', background: 'surface', minimum: 3 },
  { foreground: 'accentText', background: 'accent', minimum: 4.5 },
  { foreground: 'editorText', background: 'editorBackground', minimum: 4.5 },
  { foreground: 'heading', background: 'editorBackground', minimum: 4.5 },
  { foreground: 'link', background: 'editorBackground', minimum: 4.5 },
  { foreground: 'inlineCodeText', background: 'inlineCodeBackground', minimum: 4.5 },
];

/** Colour groups of code themes. */
export const CODE_COLOR_GROUPS: readonly ColorGroup[] = [
  {
    title: 'Editor',
    keys: [
      'background',
      'foreground',
      'gutterBackground',
      'gutterForeground',
      'lineHighlight',
      'selection',
      'cursor',
      'border',
    ],
  },
  {
    title: 'Syntax',
    keys: [
      'comment',
      'keyword',
      'controlKeyword',
      'operator',
      'punctuation',
      'string',
      'number',
      'boolean',
      'constant',
      'variable',
      'property',
      'function',
      'type',
      'className',
      'tag',
      'attribute',
      'regexp',
      'escape',
      'meta',
      'invalid',
    ],
  },
  { title: 'Markdown source', keys: ['heading', 'emphasis', 'strong', 'link', 'quote'] },
];

/** Contrast checks of code themes. */
export const CODE_CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'foreground', background: 'background', minimum: 4.5 },
  { foreground: 'comment', background: 'background', minimum: 3 },
  { foreground: 'keyword', background: 'background', minimum: 3 },
  { foreground: 'string', background: 'background', minimum: 3 },
  { foreground: 'function', background: 'background', minimum: 3 },
  { foreground: 'gutterForeground', background: 'gutterBackground', minimum: 3 },
];
