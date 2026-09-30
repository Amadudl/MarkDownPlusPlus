import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetApp, setSettings } from '@renderer/test/utils';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { ModeSwitch } from './ModeSwitch';

const docs = useDocuments.getState;

describe('ModeSwitch', () => {
  beforeEach(() => {
    resetApp();
  });

  it('is disabled without a document and shows the default mode', () => {
    const api = resetApp();
    setSettings(api, { editor: { defaultMode: 'source' } });
    render(<ModeSwitch />);
    const group = screen.getByRole('radiogroup', { name: 'Editor mode' });
    expect(group).toHaveAccessibleDescription('Switch between Visual and Markdown');
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).toHaveAttribute('data-mode', 'source');
    expect(screen.getByRole('radio', { name: 'Markdown' })).toBeDisabled();
    // Only the custom tooltip of the group: no native title tooltip on top of it.
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toHaveAttribute('title');
    expect(screen.getByRole('radio', { name: 'Visual' })).toHaveAccessibleDescription(
      'Formatted, what-you-see-is-what-you-get editing',
    );
  });

  it('switches the active document on click and shows the shortcut', async () => {
    useUi.setState({ platform: 'darwin' });
    docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    render(<ModeSwitch />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('data-shortcut', '⌘E');
    expect(screen.getByRole('radio', { name: 'Visual' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Markdown' }));
    expect(selectActiveDocument(docs())?.mode).toBe('source');
    expect(group).toHaveAttribute('data-mode', 'source');
    expect(screen.getByRole('radio', { name: 'Markdown' })).toHaveAttribute('tabindex', '0');
  });

  it('supports arrow keys (radio group pattern)', async () => {
    const user = userEvent.setup();
    docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    render(<ModeSwitch />);
    screen.getByRole('radio', { name: 'Visual' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(selectActiveDocument(docs())?.mode).toBe('source');
    expect(screen.getByRole('radio', { name: 'Markdown' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(selectActiveDocument(docs())?.mode).toBe('wysiwyg');
    await user.keyboard('{ArrowLeft}');
    expect(selectActiveDocument(docs())?.mode).toBe('source');
    await user.keyboard('{ArrowUp}');
    expect(selectActiveDocument(docs())?.mode).toBe('wysiwyg');
    await user.keyboard('{Enter}');
    expect(selectActiveDocument(docs())?.mode).toBe('wysiwyg');
  });

  it('follows mode changes made elsewhere', () => {
    const id = docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    render(<ModeSwitch />);
    act(() => docs().setMode(id, 'source'));
    expect(screen.getByRole('radio', { name: 'Markdown' })).toHaveAttribute('aria-checked', 'true');
  });
});
