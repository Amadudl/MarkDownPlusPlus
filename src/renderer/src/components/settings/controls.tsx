import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type JSX } from 'react';
import { TriangleAlert } from 'lucide-react';
import { isHexColor, mergePickedColor, toColorInputValue } from './colorInput';

/**
 * Local editable copy of a value that resets whenever the value changes from
 * outside (derived-state pattern without effects).
 */
function useSyncedDraft(value: string): [string, (draft: string) => void] {
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(value);
  if (source !== value) {
    setSource(value);
    setDraft(value);
  }
  return [draft, setDraft];
}

/** A labelled settings row with an optional description. */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly description?: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        {htmlFor === undefined ? (
          <span className="setting-label">{label}</span>
        ) : (
          <label className="setting-label" htmlFor={htmlFor}>
            {label}
          </label>
        )}
        {description !== undefined && <p className="setting-description">{description}</p>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

/** Accessible on/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly id?: string;
}): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" aria-hidden="true" />
    </button>
  );
}

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** Native select for a string union. */
export function SelectField<T extends string>({
  id,
  value,
  choices,
  onChange,
  label,
}: {
  readonly id?: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly onChange: (value: T) => void;
  readonly label?: string;
}): JSX.Element {
  return (
    <select
      id={id}
      className="select"
      aria-label={label}
      value={value}
      onChange={(event) => {
        const choice = choices.find((item) => item.value === event.target.value);
        if (choice !== undefined) onChange(choice.value);
      }}
    >
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

/** Segmented control (radio group) for a small set of choices. */
export function Segmented<T extends string>({
  value,
  choices,
  onChange,
  label,
}: {
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly onChange: (value: T) => void;
  readonly label: string;
}): JSX.Element {
  return (
    <div role="radiogroup" aria-label={label} className="segmented">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={choice.value === value}
          className={choice.value === value ? 'segmented-option is-checked' : 'segmented-option'}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/** Clamps to [min, max] and snaps to the step grid (avoiding float noise). */
export function clampToStep(value: number, min: number, max: number, step: number): number {
  const snapped = Math.round((value - min) / step) * step + min;
  const decimals = (step.toString().split('.')[1] ?? '').length;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

/** Filled share (0–100) of a slider track for `value` within `min`…`max`. */
export function rangeFill(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** Numeric input with an optional slider; values are clamped to the allowed range. */
export function NumberField({
  id,
  value,
  min,
  max,
  step = 1,
  unit,
  slider = false,
  label,
  onChange,
}: {
  readonly id?: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  readonly slider?: boolean;
  readonly label: string;
  readonly onChange: (value: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : String(value);

  const commit = (): void => {
    setEditing(false);
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return;
    const next = clampToStep(parsed, min, max, step);
    if (next !== value) onChange(next);
  };

  return (
    <div className="number-field">
      {slider && (
        <input
          type="range"
          className="range"
          style={{ '--mpp-range-fill': `${rangeFill(value, min, max)}%` } as CSSProperties}
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clampToStep(Number(event.target.value), min, max, step))}
        />
      )}
      <input
        id={id}
        type="number"
        className="text-input number-input"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={shown}
        onFocus={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        onChange={(event) => {
          setEditing(true);
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      {/* Always rendered so fields with and without a unit line up in a column. */}
      <span className="number-unit" aria-hidden={unit === undefined}>
        {unit}
      </span>
    </div>
  );
}

/** Text input that commits on blur or Enter and reverts on Escape. */
export function TextField({
  id,
  value,
  onCommit,
  label,
  placeholder,
  list,
  maxLength = 300,
}: {
  readonly id?: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly label: string;
  readonly placeholder?: string;
  readonly list?: string;
  readonly maxLength?: number;
}): JSX.Element {
  const [draft, setDraft] = useSyncedDraft(value);

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed === '') setDraft(value);
    else if (trimmed !== value) onCommit(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commit();
    else if (event.key === 'Escape') {
      event.stopPropagation();
      setDraft(value);
    }
  };

  return (
    <input
      id={id}
      type="text"
      className="text-input"
      aria-label={label}
      placeholder={placeholder}
      list={list}
      maxLength={maxLength}
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

/** Colour picker plus hex field, with an optional warning (e.g. low contrast). */
export function ColorField({
  label,
  value,
  onChange,
  warning,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly warning?: string | null;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useSyncedDraft(value);
  const hasWarning = typeof warning === 'string';
  const invalid = !isHexColor(draft);

  const commitDraft = (): void => {
    if (isHexColor(draft) && draft !== value) onChange(draft);
    else setDraft(value);
  };

  return (
    <div className="color-field" data-warning={hasWarning}>
      <label className="color-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="color-field-inputs">
        <input
          type="color"
          className="color-swatch"
          aria-label={`${label} colour picker`}
          value={toColorInputValue(value)}
          onChange={(event) => onChange(mergePickedColor(value, event.target.value))}
        />
        <input
          id={id}
          type="text"
          className="text-input color-hex"
          spellCheck={false}
          maxLength={9}
          value={draft}
          aria-invalid={invalid}
          onChange={(event) => {
            const next = event.target.value.trim();
            setDraft(next);
            // Full-length values apply live; short forms (#rgb) wait for blur/Enter to avoid flicker.
            if ((next.length === 7 || next.length === 9) && isHexColor(next) && next !== value)
              onChange(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft();
          }}
          onBlur={commitDraft}
        />
      </div>
      {hasWarning && (
        <p className="color-field-warning" role="note">
          <TriangleAlert size={12} aria-hidden="true" /> {warning}
        </p>
      )}
    </div>
  );
}
