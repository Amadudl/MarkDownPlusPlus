import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmButton } from './ConfirmButton';
import {
  clampToStep,
  ColorField,
  NumberField,
  rangeFill,
  Segmented,
  SelectField,
  SettingRow,
  TextField,
  Toggle,
} from './controls';

describe('clampToStep', () => {
  it('clamps and snaps without float noise', () => {
    expect(clampToStep(0.30000000000000004, 0, 1, 0.1)).toBe(0.3);
    expect(clampToStep(99, 0, 10, 1)).toBe(10);
    expect(clampToStep(-5, 0, 10, 1)).toBe(0);
    expect(clampToStep(1.02, 1, 2.6, 0.05)).toBe(1);
  });
});

describe('SettingRow', () => {
  it('renders a label element only when bound to a control', () => {
    render(
      <>
        <SettingRow label="Bound" htmlFor="x" description="Help">
          <input id="x" />
        </SettingRow>
        <SettingRow label="Free">
          <span />
        </SettingRow>
      </>,
    );
    expect(screen.getByLabelText('Bound')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByText('Free').tagName).toBe('SPAN');
  });
});

describe('Toggle, SelectField and Segmented', () => {
  it('report changes', async () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const onSegment = vi.fn();
    render(
      <>
        <Toggle label="Wrap" checked={false} onChange={onToggle} />
        <SelectField
          label="Kind"
          value="a"
          choices={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
          onChange={onSelect}
        />
        <Segmented
          label="Mode"
          value="x"
          choices={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ]}
          onChange={onSegment}
        />
      </>,
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Wrap' }));
    expect(onToggle).toHaveBeenCalledWith(true);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'b');
    expect(onSelect).toHaveBeenCalledWith('b');
    const select = screen.getByRole('combobox', { name: 'Kind' });
    const option = document.createElement('option');
    option.value = 'zzz';
    select.append(option);
    fireEvent.change(select, { target: { value: 'zzz' } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'X' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Y' }));
    expect(onSegment).toHaveBeenCalledWith('y');
  });
});

function ControlledNumber({ onChange }: { readonly onChange: (value: number) => void }): React.JSX.Element {
  const [value, setValue] = useState(10);
  return (
    <NumberField
      label="Size"
      value={value}
      min={8}
      max={40}
      step={2}
      unit="px"
      slider
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('NumberField', () => {
  it('commits clamped values on blur and Enter and ignores invalid input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumber onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Size' });
    expect(screen.getByText('px')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '99{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(40);
    await user.clear(input);
    await user.type(input, '15');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(16);
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(16);
    await user.click(input);
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(2);
    await user.click(input);
    await user.keyboard('a');
    fireEvent.change(input, { target: { value: '1e999' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(2);
    const slider = screen.getByRole('slider', { name: 'Size slider' });
    fireEvent.change(slider, { target: { value: '20' } });
    expect(onChange).toHaveBeenLastCalledWith(20);
    expect(slider.style.getPropertyValue('--mpp-range-fill')).toBe('37.5%');
  });

  it('renders without slider and keeps an empty unit column for alignment', () => {
    const { container } = render(
      <NumberField label="Plain" value={1} min={0} max={2} onChange={() => undefined} />,
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    const unit = container.querySelector('.number-unit');
    expect(unit).toBeEmptyDOMElement();
    expect(unit).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('rangeFill', () => {
  it('maps a value to the filled share of the track', () => {
    expect(rangeFill(0.5, 0.5, 3)).toBe(0);
    expect(rangeFill(1.75, 0.5, 3)).toBe(50);
    expect(rangeFill(3, 0.5, 3)).toBe(100);
    expect(rangeFill(9, 0, 1)).toBe(100);
    expect(rangeFill(-1, 0, 1)).toBe(0);
    expect(rangeFill(1, 1, 1)).toBe(0);
  });
});

describe('TextField', () => {
  it('commits trimmed text, reverts on Escape and empty input, and follows external values', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(<TextField label="Font" value="Inter" onCommit={onCommit} />);
    const input = screen.getByRole('textbox', { name: 'Font' });
    await user.clear(input);
    await user.type(input, '  Fira  {Enter}');
    expect(onCommit).toHaveBeenCalledWith('Fira');
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue('Inter');
    await user.click(input);
    await user.type(input, 'X{Escape}');
    expect(input).toHaveValue('Inter');
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    rerender(<TextField label="Font" value="Mono" onCommit={onCommit} />);
    expect(input).toHaveValue('Mono');
  });
});

describe('ColorField', () => {
  it('edits via picker and hex text, and shows warnings', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorField label="Accent" value="#112233" onChange={onChange} warning="Low contrast" />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Low contrast');
    fireEvent.input(screen.getByLabelText('Accent colour picker'), { target: { value: '#445566' } });
    expect(onChange).toHaveBeenLastCalledWith('#445566');
    const hex = screen.getByRole('textbox', { name: 'Accent' });
    await user.clear(hex);
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    await user.type(hex, '#abc');
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('#abc');
    await user.clear(hex);
    await user.type(hex, '#a1b2c3');
    expect(onChange).toHaveBeenLastCalledWith('#a1b2c3');
    await user.clear(hex);
    await user.type(hex, 'zz');
    await user.tab();
    expect(hex).toHaveValue('#112233');
    rerender(<ColorField label="Accent" value="#112233" onChange={onChange} warning={null} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    const calls = onChange.mock.calls.length;
    await user.clear(hex);
    await user.type(hex, '#112233');
    await user.keyboard('a');
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(calls);
  });
});

describe('ConfirmButton', () => {
  it('asks before running and can be cancelled', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Really delete" onConfirm={onConfirm}>
        Delete
      </ConfirmButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Really delete' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Really delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
