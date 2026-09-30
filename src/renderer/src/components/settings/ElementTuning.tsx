import type { JSX } from 'react';
import { HEADING_SCALE_RANGE, type ElementStyle } from '@shared/theme-model';
import { NumberField, SelectField, SettingRow, TextField, Toggle, type Choice } from './controls';

type Section = Exclude<keyof ElementStyle, 'id' | 'name' | 'description'>;

/** Applies a partial change to one section of an element style. */
export function patchSection<K extends Section>(
  style: ElementStyle,
  section: K,
  patch: Partial<ElementStyle[K]>,
): ElementStyle {
  return { ...style, [section]: { ...style[section], ...patch } };
}

const FONT_SUGGESTIONS = [
  "'Inter Variable', system-ui, sans-serif",
  "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  "'Charter', 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  "'JetBrains Mono Variable', 'Cascadia Code', Menlo, Consolas, monospace",
  "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
];

function choices<T extends string>(values: readonly (readonly [T, string])[]): Choice<T>[] {
  return values.map(([value, label]) => ({ value, label }));
}

const HEADING_COLORS = choices<ElementStyle['headings']['color']>([
  ['heading', 'Heading colour'],
  ['accent', 'Accent'],
  ['text', 'Text'],
]);
const HEADING_UNDERLINE = choices<ElementStyle['headings']['underline']>([
  ['none', 'None'],
  ['h1', 'H1'],
  ['h1-h2', 'H1 and H2'],
]);
const QUOTE_VARIANTS = choices<ElementStyle['blockquote']['variant']>([
  ['bar', 'Bar'],
  ['card', 'Card'],
  ['quote-mark', 'Quote mark'],
  ['minimal', 'Minimal'],
  ['callout', 'Callout'],
]);
const CODE_VARIANTS = choices<ElementStyle['codeBlock']['variant']>([
  ['flat', 'Flat'],
  ['bordered', 'Bordered'],
  ['shadow', 'Shadow'],
  ['window', 'Window'],
]);
const INLINE_CODE_VARIANTS = choices<ElementStyle['inlineCode']['variant']>([
  ['pill', 'Pill'],
  ['outlined', 'Outlined'],
  ['plain', 'Plain'],
  ['underline', 'Underline'],
]);
const TABLE_VARIANTS = choices<ElementStyle['table']['variant']>([
  ['grid', 'Grid'],
  ['striped', 'Striped'],
  ['minimal', 'Minimal'],
  ['bordered', 'Bordered'],
  ['card', 'Card'],
]);
const BULLETS = choices<ElementStyle['list']['bullet']>([
  ['disc', 'Disc'],
  ['circle', 'Circle'],
  ['square', 'Square'],
  ['dash', 'Dash'],
  ['arrow', 'Arrow'],
]);
const LINK_VARIANTS = choices<ElementStyle['link']['variant']>([
  ['underline', 'Underline'],
  ['hover', 'Underline on hover'],
  ['accent', 'Accent colour'],
  ['dotted', 'Dotted'],
]);
const RULE_VARIANTS = choices<ElementStyle['horizontalRule']['variant']>([
  ['line', 'Line'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
  ['fade', 'Fade'],
  ['ornament', 'Ornament'],
]);

/**
 * Fine-tuning controls for every field of an element style. Each group names the element
 * of the live preview it affects in `data-preview-target` (a CSS selector).
 */
export function ElementTuning({
  style,
  onChange,
}: {
  readonly style: ElementStyle;
  /** Receives a transformation so it can be applied to a fresh custom copy of a preset. */
  readonly onChange: (edit: (style: ElementStyle) => ElementStyle) => void;
}): JSX.Element {
  const set = <K extends Section>(section: K, patch: Partial<ElementStyle[K]>): void =>
    onChange((current) => patchSection(current, section, patch));
  const { typography: t, headings: h } = style;

  return (
    <div className="element-tuning">
      <datalist id="mpp-font-suggestions">
        {FONT_SUGGESTIONS.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>

      <fieldset className="tuning-group" data-preview-target="p">
        <legend>Typography</legend>
        <SettingRow label="Body font">
          <TextField
            label="Body font"
            list="mpp-font-suggestions"
            value={t.bodyFont}
            onCommit={(bodyFont) => set('typography', { bodyFont })}
          />
        </SettingRow>
        <SettingRow label="Heading font">
          <TextField
            label="Heading font"
            list="mpp-font-suggestions"
            value={t.headingFont}
            onCommit={(headingFont) => set('typography', { headingFont })}
          />
        </SettingRow>
        <SettingRow label="Code font">
          <TextField
            label="Code font"
            list="mpp-font-suggestions"
            value={t.monoFont}
            onCommit={(monoFont) => set('typography', { monoFont })}
          />
        </SettingRow>
        <SettingRow label="Base font size">
          <NumberField
            label="Base font size"
            value={t.baseFontSize}
            min={10}
            max={32}
            step={0.5}
            unit="px"
            slider
            onChange={(baseFontSize) => set('typography', { baseFontSize })}
          />
        </SettingRow>
        <SettingRow label="Line height">
          <NumberField
            label="Line height"
            value={t.lineHeight}
            min={1}
            max={2.6}
            step={0.05}
            slider
            onChange={(lineHeight) => set('typography', { lineHeight })}
          />
        </SettingRow>
        <SettingRow label="Paragraph spacing">
          <NumberField
            label="Paragraph spacing"
            value={t.paragraphSpacing}
            min={0}
            max={3}
            step={0.05}
            unit="em"
            slider
            onChange={(paragraphSpacing) => set('typography', { paragraphSpacing })}
          />
        </SettingRow>
        <SettingRow label="Content width">
          <NumberField
            label="Content width"
            value={t.contentWidth}
            min={480}
            max={2400}
            step={20}
            unit="px"
            slider
            onChange={(contentWidth) => set('typography', { contentWidth })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target="h1">
        <legend>Headings</legend>
        <div className="tuning-scale">
          {h.scale.map((value, index) => (
            <label key={index} className="tuning-scale-item">
              <span>H{index + 1}</span>
              <NumberField
                label={`Heading ${index + 1} size`}
                value={value}
                min={HEADING_SCALE_RANGE.min}
                max={HEADING_SCALE_RANGE.max}
                step={0.05}
                unit="×"
                onChange={(next) => {
                  const scale = [...h.scale] as ElementStyle['headings']['scale'];
                  scale[index] = next;
                  set('headings', { scale });
                }}
              />
            </label>
          ))}
        </div>
        <SettingRow label="Weight">
          <NumberField
            label="Heading weight"
            value={h.weight}
            min={300}
            max={900}
            step={100}
            slider
            onChange={(weight) => set('headings', { weight })}
          />
        </SettingRow>
        <SettingRow label="Letter spacing">
          <NumberField
            label="Heading letter spacing"
            value={h.letterSpacing}
            min={-0.1}
            max={0.3}
            step={0.005}
            unit="em"
            slider
            onChange={(letterSpacing) => set('headings', { letterSpacing })}
          />
        </SettingRow>
        <SettingRow label="Colour">
          <SelectField
            label="Heading colour"
            value={h.color}
            choices={HEADING_COLORS}
            onChange={(color) => set('headings', { color })}
          />
        </SettingRow>
        <SettingRow label="Underline">
          <SelectField
            label="Heading underline"
            value={h.underline}
            choices={HEADING_UNDERLINE}
            onChange={(underline) => set('headings', { underline })}
          />
        </SettingRow>
        <SettingRow label="Small caps for H5 / H6">
          <Toggle
            label="Uppercase small headings"
            checked={h.uppercaseSmall}
            onChange={(uppercaseSmall) => set('headings', { uppercaseSmall })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target="blockquote">
        <legend>Quotes</legend>
        <SettingRow label="Style">
          <SelectField
            label="Quote style"
            value={style.blockquote.variant}
            choices={QUOTE_VARIANTS}
            onChange={(variant) => set('blockquote', { variant })}
          />
        </SettingRow>
        <SettingRow label="Italic">
          <Toggle
            label="Italic quotes"
            checked={style.blockquote.italic}
            onChange={(italic) => set('blockquote', { italic })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target=".mpp-code-block">
        <legend>Code blocks</legend>
        <SettingRow label="Frame">
          <SelectField
            label="Code block frame"
            value={style.codeBlock.variant}
            choices={CODE_VARIANTS}
            onChange={(variant) => set('codeBlock', { variant })}
          />
        </SettingRow>
        <SettingRow label="Corner radius">
          <NumberField
            label="Code block radius"
            value={style.codeBlock.radius}
            min={0}
            max={24}
            unit="px"
            slider
            onChange={(radius) => set('codeBlock', { radius })}
          />
        </SettingRow>
        <SettingRow label="Font size">
          <NumberField
            label="Code block font size"
            value={style.codeBlock.fontSize}
            min={0.6}
            max={1.4}
            step={0.05}
            unit="em"
            slider
            onChange={(fontSize) => set('codeBlock', { fontSize })}
          />
        </SettingRow>
        <SettingRow label="Show language label">
          <Toggle
            label="Show language label"
            checked={style.codeBlock.showLanguage}
            onChange={(showLanguage) => set('codeBlock', { showLanguage })}
          />
        </SettingRow>
        <SettingRow label="Line numbers">
          <Toggle
            label="Code block line numbers"
            checked={style.codeBlock.lineNumbers}
            onChange={(lineNumbers) => set('codeBlock', { lineNumbers })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target="p code">
        <legend>Inline elements</legend>
        <SettingRow label="Inline code">
          <SelectField
            label="Inline code style"
            value={style.inlineCode.variant}
            choices={INLINE_CODE_VARIANTS}
            onChange={(variant) => set('inlineCode', { variant })}
          />
        </SettingRow>
        <SettingRow label="Links">
          <SelectField
            label="Link style"
            value={style.link.variant}
            choices={LINK_VARIANTS}
            onChange={(variant) => set('link', { variant })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target="table">
        <legend>Tables</legend>
        <SettingRow label="Style">
          <SelectField
            label="Table style"
            value={style.table.variant}
            choices={TABLE_VARIANTS}
            onChange={(variant) => set('table', { variant })}
          />
        </SettingRow>
        <SettingRow label="Compact rows">
          <Toggle
            label="Compact table rows"
            checked={style.table.compact}
            onChange={(compact) => set('table', { compact })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target="ul">
        <legend>Lists</legend>
        <SettingRow label="Bullet">
          <SelectField
            label="Bullet style"
            value={style.list.bullet}
            choices={BULLETS}
            onChange={(bullet) => set('list', { bullet })}
          />
        </SettingRow>
        <SettingRow label="Item spacing">
          <NumberField
            label="List item spacing"
            value={style.list.spacing}
            min={0}
            max={2}
            step={0.05}
            unit="em"
            slider
            onChange={(spacing) => set('list', { spacing })}
          />
        </SettingRow>
      </fieldset>

      <fieldset className="tuning-group" data-preview-target="hr">
        <legend>Rules & images</legend>
        <SettingRow label="Horizontal rule">
          <SelectField
            label="Horizontal rule style"
            value={style.horizontalRule.variant}
            choices={RULE_VARIANTS}
            onChange={(variant) => set('horizontalRule', { variant })}
          />
        </SettingRow>
        <SettingRow label="Image corner radius">
          <NumberField
            label="Image radius"
            value={style.image.radius}
            min={0}
            max={32}
            unit="px"
            slider
            onChange={(radius) => set('image', { radius })}
          />
        </SettingRow>
        <SettingRow label="Image shadow">
          <Toggle
            label="Image shadow"
            checked={style.image.shadow}
            onChange={(shadow) => set('image', { shadow })}
          />
        </SettingRow>
        <SettingRow label="Center images">
          <Toggle
            label="Center images"
            checked={style.image.centered}
            onChange={(centered) => set('image', { centered })}
          />
        </SettingRow>
      </fieldset>
    </div>
  );
}
