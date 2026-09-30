import { useState, type JSX } from 'react';
import { SelectField, TextField } from './controls';

/** A curated monospace font stack for the Markdown source editor. */
export interface SourceFontStack {
  readonly label: string;
  /** CSS `font-family` list; always ends with a generic family. */
  readonly value: string;
}

const BUNDLED_STACK: SourceFontStack = {
  label: 'JetBrains Mono (bundled)',
  value:
    "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace",
};

/** Monospace stacks offered in Settings → Editor → Source font, bundled font first. */
export const SOURCE_FONT_STACKS: readonly SourceFontStack[] = [
  BUNDLED_STACK,
  { label: 'SF Mono / Menlo', value: "'SF Mono', SFMono-Regular, ui-monospace, Menlo, Monaco, monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace" },
  { label: 'Fira Code', value: "'Fira Code', 'Fira Mono', monospace" },
  { label: 'Consolas', value: "Consolas, 'Courier New', monospace" },
  { label: 'System monospace', value: 'ui-monospace, monospace' },
];

/**
 * Default of `editor.sourceFontFamily` in 1.0.0. It names 'JetBrains Mono', but the
 * bundled font registers as 'JetBrains Mono Variable', so it is treated as the bundled stack.
 */
export const LEGACY_DEFAULT_SOURCE_FONT =
  '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, Consolas, monospace';

/** The CSS `font-family` to render for a stored source font setting. */
export function resolveSourceFont(value: string): string {
  return value === LEGACY_DEFAULT_SOURCE_FONT ? BUNDLED_STACK.value : value;
}

const CUSTOM = 'custom';
const SAMPLE = 'const answer = 42; // 0O il1| {} => ==';

/** The curated stack whose CSS value equals `value` (ignoring whitespace), if any. */
export function findSourceFontStack(value: string): SourceFontStack | undefined {
  const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();
  const resolved = normalize(resolveSourceFont(value));
  return SOURCE_FONT_STACKS.find((stack) => normalize(stack.value) === resolved);
}

/**
 * Picker for the source editor font: a list of curated stacks plus "Custom…", which
 * reveals a free-form CSS `font-family` field. A sample line previews the current font.
 */
export function SourceFontField({
  id,
  value,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const preset = findSourceFontStack(value);
  const [customRequested, setCustomRequested] = useState(false);
  const custom = customRequested || preset === undefined;

  return (
    <div className="font-picker">
      <SelectField<string>
        id={id}
        value={custom ? CUSTOM : preset.value}
        choices={[
          ...SOURCE_FONT_STACKS.map((stack) => ({ value: stack.value, label: stack.label })),
          { value: CUSTOM, label: 'Custom…' },
        ]}
        onChange={(next) => {
          if (next === CUSTOM) {
            setCustomRequested(true);
            return;
          }
          setCustomRequested(false);
          if (next !== value) onChange(next);
        }}
      />
      {custom && (
        <TextField
          id={`${id}-custom`}
          label="Custom source font"
          placeholder="'My Font', monospace"
          value={value}
          onCommit={onChange}
        />
      )}
      <p className="font-sample" style={{ fontFamily: resolveSourceFont(value) }} aria-hidden="true">
        {SAMPLE}
      </p>
    </div>
  );
}
