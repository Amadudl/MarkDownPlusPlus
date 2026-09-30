import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGEX_TOO_SLOW_ERROR, type RegexProbeRequest } from '@renderer/editor/regex-probe';
import { createFakeAdapter, type FakeAdapter } from '@renderer/test/fakeEditor';
import { resetApp } from '@renderer/test/utils';
import { setAdapter } from '@renderer/store/adapters';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { describeResult, FindBar } from './FindBar';

describe('describeResult', () => {
  it('describes errors, empty queries, misses and hits', () => {
    expect(describeResult('x', { total: 0, current: 0, error: 'Bad pattern' })).toBe('Bad pattern');
    expect(describeResult('', { total: 0, current: 0, error: null })).toBe('');
    expect(describeResult('x', { total: 0, current: 0, error: null })).toBe('No results');
    expect(describeResult('x', { total: 12, current: 3, error: null })).toBe('3 of 12');
  });
});

describe('FindBar', () => {
  let adapter: FakeAdapter;
  beforeEach(() => {
    resetApp();
    const id = useDocuments.getState().newDocument({ mode: 'source', lineEnding: 'lf' });
    adapter = createFakeAdapter('source', 'Cat cat CAT category');
    setAdapter(id, adapter);
  });

  it('is hidden until opened', () => {
    render(<FindBar />);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('searches with options and navigates matches', async () => {
    const user = userEvent.setup();
    act(() => useUi.getState().openFind(false));
    render(<FindBar />);
    const input = screen.getByRole('textbox', { name: 'Find' });
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    await user.type(input, 'cat');
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByText('4 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Match case' }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Match whole word' }));
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Match case' }));
    await user.click(screen.getByRole('button', { name: 'Match whole word' }));
    await user.click(screen.getByRole('button', { name: 'Use regular expression' }));
    await user.clear(input);
    await user.type(input, 'ca[[');
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveAttribute('aria-invalid', 'true');
    await user.clear(input);
    await user.type(input, 'dog');
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('ignores navigation with an empty query', async () => {
    act(() => useUi.getState().openFind(false));
    render(<FindBar />);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('');
  });

  it('replaces the current match and all matches', async () => {
    const user = userEvent.setup();
    act(() => useUi.getState().openFind(true));
    render(<FindBar />);
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'cat');
    const replace = screen.getByRole('textbox', { name: 'Replace' });
    await user.type(replace, 'dog');
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(adapter.markdown).toBe('dog cat CAT category');
    await user.click(replace);
    await user.keyboard('{Enter}');
    expect(adapter.markdown).toBe('dog dog CAT category');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(adapter.markdown).toBe('dog dog dog dogegory');
    expect(screen.getByText('No results')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Find' }));
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'dog');
    await user.clear(replace);
    await user.type(replace, 'cat');
    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(adapter.markdown).toBe('cat cat cat category');
  });

  it('toggles the replace row and closes with Escape', async () => {
    const user = userEvent.setup();
    act(() => useUi.getState().openFind(false));
    render(<FindBar />);
    await user.click(screen.getByRole('button', { name: 'Show replace' }));
    expect(screen.getByRole('textbox', { name: 'Replace' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide replace' }));
    expect(screen.queryByRole('textbox', { name: 'Replace' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'cat');
    await user.keyboard('{Escape}');
    expect(useUi.getState().findBar.open).toBe(false);
    expect(adapter.searchCleared).toBe(1);
    expect(adapter.focusCount).toBe(1);
    act(() => useUi.getState().openFind(false));
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('');
    await user.keyboard('a');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUi.getState().findBar.open).toBe(false);
  });

  it('keeps the result current while the document is edited', async () => {
    const user = userEvent.setup();
    act(() => useUi.getState().openFind(true));
    render(<FindBar />);
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'cat');
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    act(() => adapter.type('Cat cat CAT category cat'));
    expect(screen.getByText('1 of 5')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Find' }));
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'dog');
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
    act(() => adapter.type('a dog'));
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
  });

  it('clears the search of the previous editor when the active document changes', async () => {
    const user = userEvent.setup();
    const firstId = useDocuments.getState().activeId!;
    const secondId = useDocuments.getState().newDocument({ mode: 'source', lineEnding: 'lf' });
    const second = createFakeAdapter('source', 'cat');
    setAdapter(secondId, second);
    act(() => useDocuments.getState().activate(firstId));
    act(() => useUi.getState().openFind(false));
    render(<FindBar />);
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'cat');
    expect(adapter.searchListenerCount()).toBe(1);
    act(() => useDocuments.getState().activate(secondId));
    expect(adapter.searchCleared).toBe(1);
    expect(adapter.searchListenerCount()).toBe(0);
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(second.searchCleared).toBe(1);
    expect(second.searchListenerCount()).toBe(0);
    expect(adapter.searchCleared).toBe(1);
  });

  describe('regular expressions', () => {
    const responses: number[] = [];
    beforeEach(() => {
      responses.length = 0;
      vi.stubGlobal(
        'Worker',
        class {
          onmessage: ((event: MessageEvent) => void) | null = null;
          onerror: ((event: ErrorEvent) => void) | null = null;
          postMessage(request: RegexProbeRequest): void {
            const elapsedMs = responses.shift() ?? 1;
            queueMicrotask(() =>
              this.onmessage?.(new MessageEvent('message', { data: { id: request.id, elapsedMs } })),
            );
          }
          terminate(): void {
            /* nothing is running */
          }
        },
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('ignores the verdict of a query that was changed before its check finished', async () => {
      act(() => useUi.getState().openFind(false));
      render(<FindBar />);
      fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }));
      const input = screen.getByRole('textbox', { name: 'Find' });
      act(() => {
        fireEvent.change(input, { target: { value: 'C' } });
        fireEvent.change(input, { target: { value: 'Ca' } });
      });
      expect(await screen.findByText('1 of 4')).toBeInTheDocument();
    });

    it('refuses regular expressions that are too slow for the document', async () => {
      const user = userEvent.setup();
      act(() => useUi.getState().openFind(false));
      render(<FindBar />);
      await user.click(screen.getByRole('button', { name: 'Use regular expression' }));
      await user.type(screen.getByRole('textbox', { name: 'Find' }), 'ca');
      expect(await screen.findByText('1 of 4')).toBeInTheDocument();
      responses.push(60_000);
      await user.type(screen.getByRole('textbox', { name: 'Find' }), 't');
      expect(await screen.findByText(REGEX_TOO_SLOW_ERROR)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Find' })).toHaveAttribute('aria-invalid', 'true');
      const cleared = adapter.searchCleared;
      expect(cleared).toBeGreaterThan(0);
      await user.keyboard('{Enter}');
      expect(screen.getByText(REGEX_TOO_SLOW_ERROR)).toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: 'Find' }), 'e');
      expect(await screen.findByText('1 of 1')).toBeInTheDocument();
    });
  });

  it('works without an editor', async () => {
    const id = useDocuments.getState().activeId!;
    setAdapter(id, null);
    act(() => useUi.getState().openFind(true));
    render(<FindBar />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Find' }), 'cat{Enter}');
    expect(screen.queryByText(/of/)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(useUi.getState().findBar.open).toBe(false);
  });
});
