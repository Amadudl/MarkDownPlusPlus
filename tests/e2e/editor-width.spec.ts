import type { Locator, Page } from '@playwright/test';
import type { DomElement, RendererGlobals } from './dom';
import {
  expect,
  runCommand,
  sourceEditor,
  switchMode,
  tab,
  test,
  visualEditor,
  type LaunchedApp,
} from './fixtures';

/** Content width of the Modern element style (the default theme width). */
const THEME_WIDTH = 780;
/** Window size wide enough for full width to differ clearly from the theme width. */
const VIEWPORT = { width: 1600, height: 900 };

/** Width of the text column of an editor element: its border box minus the horizontal padding. */
function textColumnWidth(editor: Locator): Promise<number> {
  return editor.evaluate((element: DomElement) => {
    const { getComputedStyle } = globalThis as unknown as RendererGlobals;
    const style = getComputedStyle(element);
    const box = (
      element as unknown as { getBoundingClientRect(): { width: number } }
    ).getBoundingClientRect();
    const padding =
      Number.parseFloat(style.getPropertyValue('padding-left')) +
      Number.parseFloat(style.getPropertyValue('padding-right'));
    return Math.round(box.width - padding);
  });
}

/** Width of the visible editor area. */
function editorAreaWidth(window: Page): Promise<number> {
  return window
    .locator('.editor-area')
    .evaluate((element: DomElement) =>
      Math.round(
        (element as unknown as { getBoundingClientRect(): { width: number } }).getBoundingClientRect().width,
      ),
    );
}

async function openEditorSettings(window: Page): Promise<Locator> {
  await window.getByRole('button', { name: 'Settings' }).click();
  const dialog = window.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Editor' }).click();
  return dialog;
}

/** Clicks View â†’ Full Width in the native application menu. */
async function clickFullWidthMenuItem(app: LaunchedApp): Promise<void> {
  await app.electronApp.evaluate(({ BrowserWindow, Menu }) => {
    const target = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()
      ?.items.find((entry) => entry.label.replace('&', '') === 'View')
      ?.submenu?.items.find((entry) => entry.label === 'Full Width');
    if (item === undefined || target === undefined) throw new Error('View â†’ Full Width is missing');
    // Electron types MenuItem.click as a bare Function; it is called like a menu activation.
    const click = item.click as (event: unknown, window: unknown, contents: unknown) => void;
    click(undefined, target, target.webContents);
  });
}

test.describe('Editor width', () => {
  test('full and custom width resize the text column in both modes and persist', async ({
    launch,
    workspace,
  }) => {
    const path = await workspace.write('wide.md', `# Wide\n\n${'word '.repeat(400)}\n`);
    const first = await launch({ files: [path] });
    const { window } = first;
    await window.setViewportSize(VIEWPORT);

    // Theme width (default) in Visual mode and Markdown mode.
    await expect.poll(() => textColumnWidth(visualEditor(window))).toBe(THEME_WIDTH);
    await switchMode(window, 'Markdown');
    await expect.poll(() => textColumnWidth(sourceEditor(window))).toBeLessThanOrEqual(THEME_WIDTH + 32);

    // Full width from the command palette: the column spans the editor area minus the gutter.
    await runCommand(first, 'Toggle Full Width');
    const area = await editorAreaWidth(window);
    await expect.poll(() => textColumnWidth(sourceEditor(window))).toBeGreaterThan(area - 120);
    await switchMode(window, 'Visual');
    // The Visual mode gutter is clamp(48px, 7vw, 96px): 96 px on each side at this width.
    await expect.poll(() => textColumnWidth(visualEditor(window))).toBeGreaterThan(area - 2 * 96 - 24);

    // The menu item toggles back to the previous (theme) width.
    await clickFullWidthMenuItem(first);
    await expect.poll(() => textColumnWidth(visualEditor(window))).toBe(THEME_WIDTH);

    // Custom width from the settings dialog.
    const dialog = await openEditorSettings(window);
    await dialog
      .getByRole('radiogroup', { name: 'Editor width' })
      .getByRole('radio', { name: 'Custom' })
      .click();
    const width = dialog.getByRole('spinbutton', { name: 'Custom width' });
    await width.fill('1100');
    await width.press('Enter');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => textColumnWidth(visualEditor(window))).toBe(1100);
    await switchMode(window, 'Markdown');
    const custom = await textColumnWidth(sourceEditor(window));
    expect(custom).toBeGreaterThan(THEME_WIDTH + 32);
    expect(custom).toBeLessThanOrEqual(1100 + 32);
    await first.close();

    // The custom width survives a restart.
    const second = await launch({ files: [path] });
    await second.window.setViewportSize(VIEWPORT);
    await expect(tab(second.window, 'wide.md').first()).toBeVisible();
    await switchMode(second.window, 'Visual');
    await expect.poll(() => textColumnWidth(visualEditor(second.window))).toBe(1100);
    const reopened = await openEditorSettings(second.window);
    await expect(
      reopened.getByRole('radiogroup', { name: 'Editor width' }).getByRole('radio', { name: 'Custom' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(reopened.getByRole('spinbutton', { name: 'Custom width' })).toHaveValue('1100');
  });

  test('the custom width never makes the column wider than the window', async ({ launch, workspace }) => {
    const path = await workspace.write('wide.md', `# Wide\n\n${'word '.repeat(400)}\n`);
    const app = await launch({
      files: [path],
      settings: { editor: { widthMode: 'custom', customWidth: 4000 } },
    });
    const { window } = app;
    await window.setViewportSize(VIEWPORT);
    const area = await editorAreaWidth(window);
    await expect.poll(() => textColumnWidth(visualEditor(window))).toBeLessThanOrEqual(area - 2 * 96);
    await expect.poll(() => textColumnWidth(visualEditor(window))).toBeGreaterThan(area - 2 * 96 - 24);
  });
});
