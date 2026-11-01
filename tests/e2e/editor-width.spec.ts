import type { Locator, Page } from '@playwright/test';
import type { DomElement, RendererGlobals } from './dom';
import {
  activePanel,
  expect,
  pressShortcut,
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

/** Rendered width of an element (its border box). */
function boxWidth(element: Locator): Promise<number> {
  return element.evaluate((node: DomElement) =>
    Math.round(
      (node as unknown as { getBoundingClientRect(): { width: number } }).getBoundingClientRect().width,
    ),
  );
}

/**
 * Largest allowed difference in px between a block and the text column it should span
 * (Crepe's table block insets the table by a few px for its handles).
 */
const SPAN_TOLERANCE = 8;

/** A local SVG far wider than any window, so it is scaled down to the text column. */
const WIDE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="40" viewBox="0 0 4000 40"><rect width="4000" height="40" fill="#c33"/></svg>';

/** A local SVG with a 2:1 aspect ratio, wider than any window. */
const RATIO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1500" viewBox="0 0 3000 1500"><rect width="3000" height="1500" fill="#36c"/></svg>';

/** Rendered size of an element (its border box). */
function boxSize(element: Locator): Promise<{ width: number; height: number }> {
  return element.evaluate((node: DomElement) => {
    const box = (
      node as unknown as { getBoundingClientRect(): { width: number; height: number } }
    ).getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
}

/** Resolves once the image has loaded and has a natural size. */
async function waitForImage(image: Locator): Promise<void> {
  await expect
    .poll(() =>
      image.evaluate((node: DomElement) => {
        const element = node as unknown as { complete: boolean; naturalWidth: number };
        return element.complete && element.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

/** A document with every block type that has to follow the editor width. */
const BLOCKS_MARKDOWN = [
  '---',
  'title: Blocks',
  'tags: [width]',
  '---',
  '',
  '# Blocks',
  '',
  '| Name | Value |',
  '| ---- | ----- |',
  '| a    | 1     |',
  '',
  '```js',
  'const answer = 42;',
  '```',
  '',
  '![Wide picture](images/wide.svg)',
  '',
].join('\n');

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

  test('the custom width never makes the Markdown column wider than the window with word wrap', async ({
    launch,
    workspace,
  }) => {
    const path = await workspace.write('wide.md', `# Wide\n\n${'word '.repeat(400)}\n`);
    const app = await launch({
      files: [path],
      settings: { editor: { wordWrap: true, widthMode: 'custom', customWidth: 4000 } },
    });
    const { window } = app;
    await window.setViewportSize(VIEWPORT);
    await expect(visualEditor(window)).toBeVisible();
    // Switch to Markdown mode with the keyboard shortcut, the way a user does.
    await pressShortcut(app, 'CmdOrCtrl+E');
    const editor = sourceEditor(window);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveClass(/cm-lineWrapping/);
    const area = await editorAreaWidth(window);
    // The wrapped lines stay inside the window: no horizontal scrolling of the source editor.
    await expect.poll(() => boxWidth(editor)).toBeLessThanOrEqual(area);
    await expect.poll(() => textColumnWidth(editor)).toBeGreaterThan(area - 120);
    const scroller = activePanel(window).locator('.cm-scroller');
    const overflow = await scroller.evaluate((node: DomElement) => {
      const element = node as unknown as { scrollWidth: number; clientWidth: number };
      return element.scrollWidth - element.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('front matter, tables, code blocks and images span the full width column', async ({
    launch,
    workspace,
  }) => {
    await workspace.write('images/wide.svg', WIDE_SVG);
    const path = await workspace.write('blocks.md', BLOCKS_MARKDOWN);
    // Opened before the window gets its final size: loaded images follow later width changes.
    const app = await launch({ files: [path], settings: { editor: { widthMode: 'full' } } });
    const { window } = app;
    await expect(tab(window, 'blocks.md').first()).toBeVisible();
    await waitForImage(visualEditor(window).locator('img').first());
    await window.setViewportSize(VIEWPORT);
    const editor = visualEditor(window);
    await expect(editor).toBeVisible();

    const area = await editorAreaWidth(window);
    await expect.poll(() => textColumnWidth(editor)).toBeGreaterThan(area - 2 * 96 - 24);
    const column = await textColumnWidth(editor);
    expect(column).toBeGreaterThan(THEME_WIDTH + 200);

    const image = editor.locator('img').first();
    await waitForImage(image);

    const blocks: Readonly<Record<string, Locator>> = {
      'front matter': activePanel(window).locator('.mpp-front-matter'),
      // Crepe keeps a hidden drag preview table next to the real one.
      table: editor.locator('.milkdown-table-block table:not(.drag-preview table)').first(),
      'code block': editor.locator('.milkdown-code-block').first(),
      image,
    };
    for (const [name, block] of Object.entries(blocks)) {
      await expect(block, name).toBeVisible();
      await expect
        .poll(async () => Math.abs((await boxWidth(block)) - column), `${name} width vs column ${column}`)
        .toBeLessThanOrEqual(SPAN_TOLERANCE);
    }
  });

  test('a loaded image follows the column width and keeps its aspect ratio', async ({
    launch,
    workspace,
  }) => {
    await workspace.write('images/ratio.svg', RATIO_SVG);
    const path = await workspace.write('picture.md', '# Picture\n\n![Ratio](images/ratio.svg)\n');
    const app = await launch({ files: [path] });
    const { window } = app;
    await window.setViewportSize(VIEWPORT);
    const editor = visualEditor(window);
    await expect.poll(() => textColumnWidth(editor)).toBe(THEME_WIDTH);
    const image = editor.locator('img').first();
    await waitForImage(image);
    await expect.poll(async () => Math.round((await boxSize(image)).width)).toBe(THEME_WIDTH);

    const expectFollowsColumn = async (): Promise<void> => {
      const column = await textColumnWidth(editor);
      await expect.poll(async () => Math.abs((await boxSize(image)).width - column)).toBeLessThanOrEqual(1);
      const { width, height } = await boxSize(image);
      expect(Math.abs(width / height - 2), `aspect ratio of ${width}x${height}`).toBeLessThan(0.02);
    };

    // Full width: the already loaded image grows with the column.
    await runCommand(app, 'Toggle Full Width');
    await expect.poll(() => textColumnWidth(editor)).toBeGreaterThan(THEME_WIDTH + 200);
    await expectFollowsColumn();

    // A narrower window shrinks it again.
    await window.setViewportSize({ width: 1200, height: 900 });
    await expect.poll(() => textColumnWidth(editor)).toBeLessThan(1200 - 2 * 48);
    await expectFollowsColumn();

    // Back to the theme width.
    await runCommand(app, 'Toggle Full Width');
    await expect.poll(() => textColumnWidth(editor)).toBe(THEME_WIDTH);
    await expectFollowsColumn();
  });
});
