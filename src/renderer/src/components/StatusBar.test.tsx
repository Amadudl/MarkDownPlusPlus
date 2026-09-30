import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp, setSettings } from '@renderer/test/utils';
import { registerDefaultCommands } from '@renderer/commands';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { formatCursor, formatReadingTime, StatusBar } from './StatusBar';

const docs = useDocuments.getState;

describe('StatusBar', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
    registerDefaultCommands();
  });

  it('formats reading time', () => {
    expect(formatReadingTime(0.2)).toBe('< 1 min read');
    expect(formatReadingTime(3.6)).toBe('4 min read');
  });

  it('shows Ready and zoom without a document', async () => {
    setSettings(api, { appearance: { zoom: 1.2 } });
    render(<StatusBar />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom 120%. Click to reset.' }));
    await vi.waitFor(() => expect(useSettings.getState().settings.appearance.zoom).toBe(1));
  });

  it('shows statistics, cursor, line ending, encoding and save state', async () => {
    const id = docs().openFile(fakeFile('/a.md', 'one two three', { hasBom: true }), 'wysiwyg');
    render(<StatusBar />);
    expect(screen.getByText('3 words')).toBeInTheDocument();
    expect(screen.getByText('13 characters')).toHaveAttribute(
      'aria-description',
      '11 without spaces · 1 lines',
    );
    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAccessibleDescription(
      'Toggle Visual / Markdown',
    );
    expect(screen.getByText('1 min read')).toBeInTheDocument();
    expect(screen.getByText('UTF-8 BOM')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cursor position')).not.toBeInTheDocument();
    expect(screen.getByText('Saved').closest('.statusbar-saved')).toHaveAttribute('data-state', 'saved');
    act(() => useUi.getState().setCursor(id, { line: 3, column: 0, selectionLength: 0 }));
    expect(screen.queryByLabelText('Cursor position')).not.toBeInTheDocument();
    act(() => useUi.getState().setCursor(id, { line: 3, column: 0, selectionLength: 12 }));
    expect(screen.getByLabelText('Cursor position')).toHaveTextContent(/^12 characters selected$/);
    await userEvent.click(screen.getByRole('button', { name: /Line endings: LF/ }));
    expect(selectActiveDocument(docs())?.lineEnding).toBe('crlf');
    expect(screen.getByText('Unsaved')).toHaveAttribute('data-state', 'unsaved');
    await userEvent.click(screen.getByRole('button', { name: 'Visual' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Markdown' })).toBeInTheDocument());
  });

  it('marks untitled documents and plain UTF-8', () => {
    docs().newDocument({ mode: 'source', lineEnding: 'crlf' });
    render(<StatusBar />);
    const state = screen.getByText('Not saved yet');
    expect(state).toHaveAttribute('data-state', 'new');
    expect(state.querySelector('svg')).toBeNull();
    expect(screen.getByText('UTF-8')).toBeInTheDocument();
    expect(screen.getByText('CRLF')).toBeInTheDocument();
  });
});

describe('formatCursor', () => {
  it('shows the source position in Markdown mode', () => {
    expect(formatCursor('source', { line: 4, column: 7, selectionLength: 0 })).toBe('Ln 4, Col 7');
    expect(formatCursor('source', { line: 4, column: 7, selectionLength: 1 })).toBe(
      'Ln 4, Col 7 (1 character selected)',
    );
    expect(formatCursor('source', { line: 4, column: 7, selectionLength: 1234 })).toBe(
      'Ln 4, Col 7 (1,234 characters selected)',
    );
  });

  it('only reports selections in Visual mode', () => {
    expect(formatCursor('wysiwyg', { line: 15, column: 0, selectionLength: 0 })).toBe('');
    expect(formatCursor('wysiwyg', { line: 15, column: 0, selectionLength: 3 })).toBe(
      '3 characters selected',
    );
  });
});
