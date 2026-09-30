import { rm } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, pressShortcut, saveState, tab, tabs, test, visualEditor } from './fixtures';

/** Structural types for code evaluated in the renderer (the E2E tsconfig has no DOM lib). */
interface Box {
  readonly left: number;
  readonly right: number;
}
interface ScrollElement {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  getBoundingClientRect(): Box;
}
interface ZoomRecorder {
  __zooms?: string[];
}

async function openSettings(window: Page, section: string) {
  await window.getByRole('button', { name: 'Settings' }).click();
  const dialog = window.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: section }).click();
  await expect(dialog.getByRole('tab', { name: section })).toHaveAttribute('aria-selected', 'true');
  return dialog;
}

test.describe('Shell usability', () => {
  test('closing a deleted file with unsaved edits from the banner asks first', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({ files: [workspace.path('third.md')] });
    const { window } = app;
    await visualEditor(window).getByText('Yet another document.').click();
    await window.keyboard.press('End');
    await window.keyboard.type(' My unsaved edit.', { delay: 20 });
    await expect(tab(window, 'third.md')).toHaveClass(/is-dirty/);
    await rm(workspace.path('third.md'));
    const banner = window.locator('.change-banner[role="alert"]');
    await expect(banner).toContainText('third.md was deleted or moved on disk.', { timeout: 15_000 });

    await app.stubs.queueMessageBox(2);
    await banner.getByRole('button', { name: 'Close' }).click();
    await expect.poll(async () => (await app.stubs.calls('messageBox')).length).toBe(1);
    await expect(tab(window, 'third.md')).toBeVisible();
    await expect(visualEditor(window)).toContainText('My unsaved edit.');
  });

  test('overflowing tabs stay reachable and the active tab stays visible', async ({ mpp }) => {
    const { window, electronApp } = mpp;
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(760, 600));
    for (let index = 0; index < 9; index += 1) await pressShortcut(mpp, 'CmdOrCtrl+N');
    await expect(tabs(window)).toHaveCount(9);
    const overflow = window.getByRole('button', { name: 'All open documents' });
    await expect(overflow).toBeVisible();

    const list = window.getByRole('tablist', { name: 'Open documents' });
    const visible = async (title: string): Promise<boolean> => {
      const listBox = await list.evaluate((element: ScrollElement) => element.getBoundingClientRect());
      const tabBox = await tab(window, title).evaluate((element: ScrollElement) =>
        element.getBoundingClientRect(),
      );
      return tabBox.left >= listBox.left - 1 && tabBox.right <= listBox.right + 1;
    };
    await expect(tab(window, 'Untitled-9')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => visible('Untitled-9')).toBe(true);

    // Narrowing the window keeps the active tab in view.
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(620, 600));
    await expect.poll(() => visible('Untitled-9')).toBe(true);

    await overflow.click();
    const menu = window.getByRole('menu', { name: 'All open documents' });
    await expect(menu.getByRole('menuitemradio')).toHaveCount(9);
    await menu.getByRole('menuitemradio', { name: 'Untitled-1' }).click();
    await expect(menu).toBeHidden();
    await expect(tab(window, 'Untitled-1')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => visible('Untitled-1')).toBe(true);
  });

  test('the shortcuts dialog closes from its footer and names the slash menu', async ({ mpp }) => {
    const { window } = mpp;
    await pressShortcut(mpp, 'CmdOrCtrl+/');
    const shortcuts = window.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(shortcuts).toContainText('Open the slash menu (Visual mode, empty line)');
    await shortcuts.getByRole('button', { name: 'Close' }).click();
    await expect(shortcuts).toBeHidden();
  });

  test('new documents show a neutral save state', async ({ mpp }) => {
    const { window } = mpp;
    await pressShortcut(mpp, 'CmdOrCtrl+N');
    await expect(saveState(window)).toHaveText('Not saved yet');
    await expect(saveState(window)).toHaveAttribute('data-state', 'new');
    await expect(saveState(window).locator('svg')).toHaveCount(0);
  });

  test('dragging the zoom slider never jumps back to an older value', async ({ mpp }) => {
    const { window } = mpp;
    const dialog = await openSettings(window, 'Appearance');
    await window.evaluate(() => {
      const recorder = globalThis as unknown as ZoomRecorder & {
        document: { documentElement: { style: { getPropertyValue(name: string): string } } };
        MutationObserver: new (callback: () => void) => {
          observe(target: unknown, options: { attributes: boolean }): void;
        };
      };
      recorder.__zooms = [];
      const root = recorder.document.documentElement;
      new recorder.MutationObserver(() => {
        const value = root.style.getPropertyValue('--mpp-zoom');
        if (recorder.__zooms?.at(-1) !== value) recorder.__zooms?.push(value);
      }).observe(root, { attributes: true });
    });
    const slider = dialog.getByRole('slider', { name: 'Zoom slider' });
    for (let percent = 110; percent <= 200; percent += 10) await slider.fill(String(percent));
    await expect
      .poll(() => window.evaluate(() => (globalThis as unknown as ZoomRecorder).__zooms?.at(-1)))
      .toBe('2');
    const zooms = (await window.evaluate(() => (globalThis as unknown as ZoomRecorder).__zooms)) ?? [];
    const values = zooms.map(Number);
    expect(values.length).toBeGreaterThan(0);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index], `zoom sequence ${zooms.join(',')}`).toBeGreaterThanOrEqual(
        values[index - 1] ?? 0,
      );
    }
    await dialog.getByRole('slider', { name: 'Zoom slider' }).fill('100');
  });

  test('every settings section opens at its top', async ({ mpp }) => {
    const { window } = mpp;
    const dialog = await openSettings(window, 'Appearance');
    const panel = dialog.getByRole('tabpanel');
    await panel.evaluate((element: ScrollElement) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => panel.evaluate((element: ScrollElement) => element.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('tab', { name: 'Markdown Elements' }).click();
    await expect(dialog.getByRole('heading', { name: 'Markdown Elements' })).toBeInViewport();
    expect(await dialog.getByRole('tabpanel').evaluate((element: ScrollElement) => element.scrollTop)).toBe(
      0,
    );
  });

  test('the About dialog focuses Close, not an external link', async ({ mpp }) => {
    const { window } = mpp;
    await window.getByRole('button', { name: 'Command palette', exact: true }).click();
    const input = window.getByRole('combobox', { name: 'Search commands and recent files' });
    await input.fill('About MarkDown');
    await input.press('Enter');
    const about = window.getByRole('dialog', { name: 'About MarkDown++' });
    await expect(about.getByRole('button', { name: 'Close' })).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(about).toBeHidden();
    expect(await mpp.stubs.calls('openExternal')).toEqual([]);
  });
});
