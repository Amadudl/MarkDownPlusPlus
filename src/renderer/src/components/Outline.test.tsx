import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeAdapter } from '@renderer/test/fakeEditor';
import { resetApp } from '@renderer/test/utils';
import { setAdapter } from '@renderer/store/adapters';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { Outline } from './Outline';

describe('Outline', () => {
  beforeEach(() => {
    resetApp();
  });

  it('shows an empty state without headings', () => {
    render(<Outline />);
    expect(screen.getByText(/No headings yet/)).toBeInTheDocument();
    act(
      () =>
        void useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf', content: 'text only' }),
    );
    expect(screen.getByText(/No headings yet/)).toBeInTheDocument();
  });

  it('lists headings, indents them and scrolls on click', async () => {
    const id = useDocuments.getState().newDocument({
      mode: 'wysiwyg',
      lineEnding: 'lf',
      content: '## Intro\n\ntext\n\n### Details\n\n## Next\n\n```\n# not a heading\n```\n',
    });
    const adapter = createFakeAdapter('wysiwyg', '');
    setAdapter(id, adapter);
    render(<Outline />);
    const items = screen.getAllByRole('button').filter((button) => button.classList.contains('outline-item'));
    expect(items.map((item) => item.textContent)).toEqual(['Intro', 'Details', 'Next']);
    expect(items[0]!.parentElement).toHaveStyle({ paddingInlineStart: '0px' });
    expect(items[1]!.parentElement).toHaveStyle({ paddingInlineStart: '12px' });
    await userEvent.click(items[1]!);
    expect(adapter.scrolledTo).toEqual([1]);
    expect(items[1]).toHaveAttribute('aria-current', 'location');
  });

  it('labels empty headings and hides itself', async () => {
    useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf', content: '#\n' });
    render(<Outline />);
    expect(screen.getByText('Untitled heading')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Untitled heading'));
    useUi.setState({ outlineVisible: true });
    await userEvent.click(screen.getByRole('button', { name: 'Hide outline' }));
    expect(useUi.getState().outlineVisible).toBe(false);
  });
});
