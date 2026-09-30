import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp } from '@renderer/test/utils';
import { useDocuments } from '@renderer/store/documents';
import { measureOverflow, TabStrip } from './TabStrip';

const docs = useDocuments.getState;

function dataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  const types: string[] = [];
  return {
    types,
    setData(type: string, value: string) {
      data.set(type, value);
      types.push(type);
    },
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'all',
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

describe('TabStrip', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
    docs().openFile(fakeFile('/docs/a.md'), 'wysiwyg');
    docs().openFile(fakeFile('/docs/b.md'), 'wysiwyg');
    docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
  });

  it('renders tabs with selection, tooltips and dirty state', () => {
    const id = docs().documents[0]!.id;
    act(() => docs().updateContent(id, 'dirty'));
    render(<TabStrip />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['a.md(unsaved changes)', 'b.md', 'Untitled-1']);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[2]).toHaveAttribute('tabindex', '0');
    expect(tabs[0]).toHaveAttribute('title', '/docs/a.md');
    expect(tabs[2]).toHaveAttribute('title', 'Untitled-1 (not saved yet)');
    expect(tabs[0]).toHaveClass('is-dirty');
  });

  it('activates on click and closes via button and middle click', async () => {
    const user = userEvent.setup();
    render(<TabStrip />);
    await user.click(screen.getByRole('tab', { name: /a\.md/ }));
    expect(docs().activeId).toBe(docs().documents[0]!.id);
    await user.click(screen.getByRole('button', { name: 'Close b.md' }));
    await vi.waitFor(() => expect(docs().documents).toHaveLength(2));
    const tab = screen.getByRole('tab', { name: /a\.md/ });
    fireEvent.mouseDown(tab, { button: 1 });
    fireEvent.mouseDown(tab, { button: 0 });
    fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, button: 2 }));
    expect(docs().documents).toHaveLength(2);
    fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    await vi.waitFor(() => expect(docs().documents).toHaveLength(1));
  });

  it('supports keyboard navigation and Delete', async () => {
    const user = userEvent.setup();
    render(<TabStrip />);
    const list = screen.getAllByRole('tab');
    list[2]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /a\.md/ })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Untitled-1' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(docs().activeId).toBe(docs().documents[0]!.id);
    await user.keyboard('{End}');
    expect(docs().activeId).toBe(docs().documents[2]!.id);
    await user.keyboard('x');
    await user.keyboard('{Delete}');
    await vi.waitFor(() => expect(docs().documents).toHaveLength(2));
  });

  it('creates documents from the plus button and by double-clicking empty space', async () => {
    const user = userEvent.setup();
    render(<TabStrip />);
    await user.click(screen.getByRole('button', { name: 'New document' }));
    expect(docs().documents).toHaveLength(4);
    await user.dblClick(screen.getByRole('tablist'));
    expect(docs().documents).toHaveLength(5);
    await user.dblClick(screen.getAllByRole('tab')[0]!);
    expect(docs().documents).toHaveLength(5);
    await user.dblClick(document.querySelector('.tabstrip-filler')!);
    expect(docs().documents).toHaveLength(6);
  });

  it('reorders tabs by drag and drop', () => {
    render(<TabStrip />);
    const [a, , c] = screen.getAllByRole('tab');
    const transfer = dataTransfer();
    fireEvent.dragStart(c!, { dataTransfer: transfer });
    fireEvent.dragOver(a!, { dataTransfer: transfer });
    expect(a).toHaveClass('is-drop-target');
    fireEvent.drop(a!, { dataTransfer: transfer });
    expect(docs().documents.map((doc) => doc.title)).toEqual(['Untitled-1', 'a.md', 'b.md']);
    fireEvent.dragEnd(c!);
  });

  it('falls back to the dragged id and ignores foreign drags', () => {
    render(<TabStrip />);
    const [a, b] = screen.getAllByRole('tab');
    const foreign = dataTransfer();
    fireEvent.dragOver(a!, { dataTransfer: foreign });
    expect(a).not.toHaveClass('is-drop-target');
    fireEvent.drop(a!, { dataTransfer: foreign });
    expect(docs().documents.map((doc) => doc.title)).toEqual(['a.md', 'b.md', 'Untitled-1']);
    const transfer = dataTransfer();
    fireEvent.dragStart(b!, { dataTransfer: transfer });
    fireEvent.drop(a!, { dataTransfer: dataTransfer() });
    expect(docs().documents.map((doc) => doc.title)).toEqual(['b.md', 'a.md', 'Untitled-1']);
    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(3);
    expect(api.file.read).not.toHaveBeenCalled();
  });

  it('copes with an empty strip', async () => {
    act(() => docs().closeAll());
    render(<TabStrip />);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(screen.queryAllByRole('tab')).toEqual([]);
  });

  it('scrolls the active tab into view after layout', async () => {
    const reveal = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<TabStrip />);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(reveal.mock.instances).toContain(screen.getByRole('tab', { name: 'Untitled-1' }));
    reveal.mockRestore();
  });

  describe('overflow', () => {
    const resizeCallbacks: (() => void)[] = [];
    const disconnect = vi.fn();

    beforeEach(() => {
      resizeCallbacks.length = 0;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            resizeCallbacks.push(callback);
          }
          observe(): void {
            // The callbacks are triggered by the tests.
          }
          disconnect = disconnect;
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function layout(list: HTMLElement, sizes: { scrollWidth: number; clientWidth: number }): void {
      Object.defineProperty(list, 'scrollWidth', { configurable: true, value: sizes.scrollWidth });
      Object.defineProperty(list, 'clientWidth', { configurable: true, value: sizes.clientWidth });
    }

    it('measures hidden content on both edges', () => {
      const list = document.createElement('div');
      layout(list, { scrollWidth: 300, clientWidth: 300 });
      expect(measureOverflow(list)).toEqual({ start: false, end: false });
      layout(list, { scrollWidth: 600, clientWidth: 300 });
      expect(measureOverflow(list)).toEqual({ start: false, end: true });
      list.scrollLeft = 150;
      expect(measureOverflow(list)).toEqual({ start: true, end: true });
      list.scrollLeft = 300;
      expect(measureOverflow(list)).toEqual({ start: true, end: false });
    });

    it('keeps the active tab in view when the strip is resized', () => {
      const reveal = vi.spyOn(Element.prototype, 'scrollIntoView');
      const { unmount } = render(<TabStrip />);
      reveal.mockClear();
      act(() => resizeCallbacks.at(-1)?.());
      expect(reveal).toHaveBeenCalledTimes(1);
      expect(reveal.mock.instances[0]).toBe(screen.getByRole('tab', { name: 'Untitled-1' }));
      unmount();
      expect(disconnect).toHaveBeenCalled();
      reveal.mockRestore();
    });

    it('fades hidden edges, scrolls with the wheel and lists every tab in a menu', async () => {
      const user = userEvent.setup();
      render(<TabStrip />);
      const list = screen.getByRole('tablist');
      expect(list).toHaveAttribute('data-overflow-end', 'false');
      expect(screen.queryByRole('button', { name: 'All open documents' })).not.toBeInTheDocument();

      layout(list, { scrollWidth: 900, clientWidth: 300 });
      fireEvent.scroll(list);
      expect(list).toHaveAttribute('data-overflow-start', 'false');
      expect(list).toHaveAttribute('data-overflow-end', 'true');

      fireEvent.wheel(list, { deltaY: 120, deltaX: 0 });
      expect(list.scrollLeft).toBe(120);
      fireEvent.wheel(list, { deltaY: 0, deltaX: 40 });
      expect(list.scrollLeft).toBe(120);
      fireEvent.scroll(list);
      expect(list).toHaveAttribute('data-overflow-start', 'true');

      const trigger = screen.getByRole('button', { name: 'All open documents' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await user.click(trigger);
      const menu = screen.getByRole('menu', { name: 'All open documents' });
      const items = within(menu).getAllByRole('menuitemradio');
      expect(items.map((item) => item.textContent)).toEqual(['a.md', 'b.md', 'Untitled-1']);
      expect(items[2]).toHaveAttribute('aria-checked', 'true');
      expect(items[2]).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(items[0]).toHaveFocus();
      await user.keyboard('{ArrowUp}{ArrowUp}');
      expect(items[1]).toHaveFocus();
      await user.keyboard('{Home}');
      expect(items[0]).toHaveFocus();
      await user.keyboard('{End}');
      expect(items[2]).toHaveFocus();
      await user.keyboard('x');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();

      await user.click(trigger);
      await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'a.md' }));
      expect(docs().activeId).toBe(docs().documents[0]!.id);
      expect(screen.getByRole('tab', { name: /a\.md/ })).toHaveFocus();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('marks dirty documents and closes the menu on outside clicks and Tab', async () => {
      const user = userEvent.setup();
      act(() => docs().updateContent(docs().documents[1]!.id, 'changed'));
      render(<TabStrip />);
      const list = screen.getByRole('tablist');
      layout(list, { scrollWidth: 900, clientWidth: 300 });
      fireEvent.scroll(list);
      const trigger = screen.getByRole('button', { name: 'All open documents' });
      await user.click(trigger);
      expect(screen.getByRole('menuitemradio', { name: /b\.md/ })).toContainElement(
        screen.getByRole('img', { name: 'unsaved changes' }),
      );
      fireEvent.mouseDown(screen.getByRole('menu'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      await user.click(trigger);
      await user.keyboard('{Tab}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      await user.click(trigger);
      await user.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('focuses the first entry without an active tab and navigates from outside the items', async () => {
      const user = userEvent.setup();
      act(() => useDocuments.setState({ activeId: null }));
      render(<TabStrip />);
      const list = screen.getByRole('tablist');
      layout(list, { scrollWidth: 900, clientWidth: 300 });
      fireEvent.scroll(list);
      await user.click(screen.getByRole('button', { name: 'All open documents' }));
      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitemradio');
      expect(items.every((item) => item.getAttribute('aria-checked') === 'false')).toBe(true);
      expect(items[0]).toHaveFocus();
      items[0]!.blur();
      fireEvent.keyDown(menu, { key: 'ArrowUp' });
      expect(items[2]).toHaveFocus();
    });

    it('works without ResizeObserver', () => {
      vi.stubGlobal('ResizeObserver', undefined);
      render(<TabStrip />);
      expect(screen.getAllByRole('tab')).toHaveLength(3);
    });
  });
});
