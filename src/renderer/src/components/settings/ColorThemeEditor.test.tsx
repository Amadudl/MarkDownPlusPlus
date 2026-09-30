import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorThemeEditor, contrastWarning, type EditableColorTheme } from './ColorThemeEditor';

const pairs = [{ foreground: 'text', background: 'background', minimum: 4.5 }];

describe('contrastWarning', () => {
  it('warns about low contrast pairs only', () => {
    expect(contrastWarning({ text: '#777777', background: '#888888' }, 'text', pairs)).toMatch(
      /^Contrast 1\.\d\d:1 on background/,
    );
    expect(contrastWarning({ text: '#000000', background: '#ffffff' }, 'text', pairs)).toBeNull();
    expect(contrastWarning({ text: '#000000' }, 'text', pairs)).toBeNull();
    expect(contrastWarning({ text: '#000000', background: '#000000' }, 'background', pairs)).toBeNull();
  });
});

describe('ColorThemeEditor', () => {
  it('falls back to black for colours missing from the theme', () => {
    const theme: EditableColorTheme = {
      id: 'custom-x',
      name: 'X',
      kind: 'dark',
      colors: { text: '#ffffff' },
    };
    render(
      <ColorThemeEditor
        theme={theme}
        groups={[{ title: 'All', keys: ['text', 'unknown'] }]}
        contrastPairs={pairs}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Unknown' })).toHaveValue('#000000');
  });
});
