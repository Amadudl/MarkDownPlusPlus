import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ElementStyle } from '@shared/theme-model';
import { BUILTIN_ELEMENT_STYLES } from '@renderer/themes';
import { ElementTuning, patchSection } from './ElementTuning';
import { describeElementStyle } from './ElementsSection';

const base = BUILTIN_ELEMENT_STYLES[0]!;

function Harness({ onStyle }: { readonly onStyle: (style: ElementStyle) => void }): React.JSX.Element {
  const [style, setStyle] = useState(base);
  return (
    <ElementTuning
      style={style}
      onChange={(edit) => {
        const next = edit(style);
        onStyle(next);
        setStyle(next);
      }}
    />
  );
}

describe('ElementTuning', () => {
  it('patches a single section', () => {
    const next = patchSection(base, 'table', { compact: !base.table.compact });
    expect(next.table.compact).toBe(!base.table.compact);
    expect(next.table.variant).toBe(base.table.variant);
    expect(next.list).toBe(base.list);
  });

  it('describes presets', () => {
    expect(describeElementStyle(base)).toContain('quotes');
  });

  it('edits every field of an element style', async () => {
    const user = userEvent.setup();
    let latest = base;
    render(<Harness onStyle={(style) => (latest = style)} />);

    const text = async (label: string, value: string): Promise<void> => {
      // Inputs with a datalist are exposed as comboboxes.
      const input = screen.getByRole('combobox', { name: label });
      await user.clear(input);
      await user.type(input, `${value}{Enter}`);
    };
    const slide = (label: string, value: number): void => {
      fireEvent.change(screen.getByRole('slider', { name: `${label} slider` }), {
        target: { value: String(value) },
      });
    };
    const number = async (label: string, value: number): Promise<void> => {
      const input = screen.getByRole('spinbutton', { name: label });
      await user.clear(input);
      await user.type(input, `${value}{Enter}`);
    };
    const select = (label: string, value: string): Promise<void> =>
      user.selectOptions(screen.getByRole('combobox', { name: label }), value);
    const toggle = (label: string): Promise<void> => user.click(screen.getByRole('switch', { name: label }));

    await text('Body font', 'Georgia, serif');
    await text('Heading font', 'Inter');
    await text('Code font', 'Menlo');
    slide('Base font size', 18);
    slide('Line height', 1.8);
    slide('Paragraph spacing', 1.5);
    slide('Content width', 1000);
    await number('Heading 1 size', 3);
    slide('Heading weight', 800);
    slide('Heading letter spacing', 0.01);
    await select('Heading colour', 'accent');
    await select('Heading underline', 'h1-h2');
    await toggle('Uppercase small headings');
    await select('Quote style', 'callout');
    await toggle('Italic quotes');
    await select('Code block frame', 'window');
    slide('Code block radius', 13);
    slide('Code block font size', 0.9);
    await toggle('Show language label');
    await toggle('Code block line numbers');
    await select('Inline code style', 'outlined');
    await select('Link style', 'dotted');
    await select('Table style', 'card');
    await toggle('Compact table rows');
    await select('Bullet style', 'arrow');
    slide('List item spacing', 0.5);
    await select('Horizontal rule style', 'ornament');
    slide('Image radius', 16);
    await toggle('Image shadow');
    await toggle('Center images');

    expect(latest.typography).toEqual({
      ...base.typography,
      bodyFont: 'Georgia, serif',
      headingFont: 'Inter',
      monoFont: 'Menlo',
      baseFontSize: 18,
      lineHeight: 1.8,
      paragraphSpacing: 1.5,
      contentWidth: 1000,
    });
    expect(latest.headings).toMatchObject({
      weight: 800,
      letterSpacing: 0.01,
      color: 'accent',
      underline: 'h1-h2',
      uppercaseSmall: !base.headings.uppercaseSmall,
    });
    expect(latest.headings.scale[0]).toBe(3);
    expect(latest.headings.scale.slice(1)).toEqual(base.headings.scale.slice(1));
    expect(latest.blockquote).toEqual({ variant: 'callout', italic: !base.blockquote.italic });
    expect(latest.codeBlock).toEqual({
      variant: 'window',
      radius: 13,
      fontSize: 0.9,
      showLanguage: !base.codeBlock.showLanguage,
      lineNumbers: !base.codeBlock.lineNumbers,
    });
    expect(latest.inlineCode.variant).toBe('outlined');
    expect(latest.link.variant).toBe('dotted');
    expect(latest.table).toEqual({ variant: 'card', compact: !base.table.compact });
    expect(latest.list).toEqual({ bullet: 'arrow', spacing: 0.5 });
    expect(latest.horizontalRule.variant).toBe('ornament');
    expect(latest.image).toEqual({ radius: 16, shadow: !base.image.shadow, centered: !base.image.centered });
  }, 20_000); // ~40 user-event interactions: slow on shared Windows CI runners.
});
