import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/settings';
import {
  findSourceFontStack,
  LEGACY_DEFAULT_SOURCE_FONT,
  resolveSourceFont,
  SOURCE_FONT_STACKS,
  SourceFontField,
} from './SourceFontField';

function Controlled({
  initial,
  onChange,
}: {
  readonly initial: string;
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="font">Source font</label>
      <SourceFontField
        id="font"
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    </>
  );
}

const select = (): HTMLElement => screen.getByRole('combobox', { name: 'Source font' });
const sample = (): HTMLElement => screen.getByText(/const answer = 42/);

describe('findSourceFontStack', () => {
  it('matches curated stacks regardless of whitespace', () => {
    expect(findSourceFontStack(SOURCE_FONT_STACKS[2]!.value)).toBe(SOURCE_FONT_STACKS[2]);
    expect(findSourceFontStack('  ui-monospace,\n  monospace ')?.label).toBe('System monospace');
    expect(findSourceFontStack('ui-monospace,monospace')).toBeUndefined();
    expect(findSourceFontStack('Comic Sans MS')).toBeUndefined();
  });

  it('treats the 1.0.0 default as the bundled stack', () => {
    expect(resolveSourceFont(LEGACY_DEFAULT_SOURCE_FONT)).toBe(SOURCE_FONT_STACKS[0]!.value);
    expect(resolveSourceFont('Iosevka')).toBe('Iosevka');
    expect(findSourceFontStack(LEGACY_DEFAULT_SOURCE_FONT)?.label).toBe('JetBrains Mono (bundled)');
  });

  it('offers the default source font as the bundled stack', () => {
    expect(findSourceFontStack(DEFAULT_SETTINGS.editor.sourceFontFamily)?.label).toBe(
      'JetBrains Mono (bundled)',
    );
  });
});

describe('SourceFontField', () => {
  it('picks curated stacks and previews them', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={DEFAULT_SETTINGS.editor.sourceFontFamily} onChange={onChange} />);
    expect(select()).toHaveDisplayValue('JetBrains Mono (bundled)');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.selectOptions(select(), 'Fira Code');
    expect(onChange).toHaveBeenLastCalledWith("'Fira Code', 'Fira Mono', monospace");
    expect(sample().style.fontFamily).toMatch(/^.Fira Code., .Fira Mono., monospace$/);
    await user.selectOptions(select(), 'Fira Code');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reveals a free-form field for custom stacks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={SOURCE_FONT_STACKS[0]!.value} onChange={onChange} />);
    await user.selectOptions(select(), 'Custom…');
    expect(onChange).not.toHaveBeenCalled();
    const field = screen.getByRole('textbox', { name: 'Custom source font' });
    expect(field).toHaveValue(SOURCE_FONT_STACKS[0]!.value);
    await user.clear(field);
    await user.type(field, 'Iosevka, monospace{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('Iosevka, monospace');
    expect(select()).toHaveDisplayValue('Custom…');
    expect(sample().style.fontFamily).toBe('Iosevka, monospace');
    await user.selectOptions(select(), 'Consolas');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith("Consolas, 'Courier New', monospace");
  });

  it('shows unknown values as custom', () => {
    render(<Controlled initial="Comic Sans MS" onChange={() => undefined} />);
    expect(select()).toHaveDisplayValue('Custom…');
    expect(screen.getByRole('textbox', { name: 'Custom source font' })).toHaveValue('Comic Sans MS');
  });
});
