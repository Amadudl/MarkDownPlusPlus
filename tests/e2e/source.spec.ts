import type { Page } from '@playwright/test';
import {
  expect,
  pressShortcut,
  sourceEditor,
  sourceText,
  tab,
  test,
  type LaunchedApp,
  type LaunchOptions,
} from './fixtures';

/** Starts the app with Markdown mode as the default mode. */
const SOURCE_DEFAULT: LaunchOptions = { settings: { editor: { defaultMode: 'source' } } };

async function newSourceDocument(app: LaunchedApp): Promise<Page> {
  const { window } = app;
  await window.getByRole('button', { name: 'New document' }).first().click();
  await expect(sourceEditor(window)).toBeVisible();
  await sourceEditor(window).click();
  await expect(sourceEditor(window)).toBeFocused();
  return window;
}

function gutterNumbers(window: Page) {
  return window.locator('.editor-panel:not([hidden]) .cm-lineNumbers .cm-gutterElement:visible');
}

test.describe('Markdown mode (source)', () => {
  test('typing updates the document, the cursor position and the statistics', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    await window.keyboard.type('# Title\n\nOne two three', { delay: 10 });
    await expect.poll(() => sourceText(window)).toBe('# Title\n\nOne two three');
    const status = window.getByRole('contentinfo', { name: 'Status bar' });
    await expect(status.getByLabel('Cursor position')).toHaveText('Ln 3, Col 14');
    await expect(status).toContainText('4 words');
    await expect(tab(window, 'Untitled-1')).toHaveClass(/is-dirty/);
    // Markdown syntax is highlighted, not rendered.
    await expect(sourceEditor(window).locator('.cm-line').first()).toHaveText('# Title');
  });

  test('shows line numbers that follow the document and can be turned off', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    await window.keyboard.type('a\nb\nc\nd', { delay: 10 });
    await expect(gutterNumbers(window)).toHaveText(['1', '2', '3', '4']);

    await window.getByRole('button', { name: 'Settings' }).click();
    const dialog = window.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('tab', { name: 'Editor' }).click();
    const toggle = dialog.getByRole('switch', { name: 'Line numbers' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    await expect(window.locator('.editor-panel:not([hidden]) .cm-lineNumbers')).toHaveCount(0);
  });

  test('the bold shortcut wraps and unwraps the selection exactly once', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    await window.keyboard.type('make me bold', { delay: 10 });
    await window.keyboard.press('Shift+Home');
    await pressShortcut(app, 'CmdOrCtrl+B');
    await expect.poll(() => sourceText(window)).toBe('**make me bold**');
    await pressShortcut(app, 'CmdOrCtrl+B');
    await expect.poll(() => sourceText(window)).toBe('make me bold');
    await pressShortcut(app, 'CmdOrCtrl+I');
    await expect.poll(() => sourceText(window)).toBe('*make me bold*');
  });

  test('formatting commands from the toolbar edit the Markdown text', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    const toolbar = window.getByRole('toolbar', { name: 'Formatting' });
    await window.keyboard.type('Title', { delay: 10 });
    await toolbar.getByRole('button', { name: 'Heading 1' }).click();
    await expect.poll(() => sourceText(window)).toBe('# Title');
    await toolbar.getByRole('button', { name: 'Heading 3' }).click();
    await expect.poll(() => sourceText(window)).toBe('### Title');
    await toolbar.getByRole('button', { name: 'Paragraph' }).click();
    await expect.poll(() => sourceText(window)).toBe('Title');

    await toolbar.getByRole('button', { name: 'Bulleted list' }).click();
    await expect.poll(() => sourceText(window)).toBe('- Title');
    await toolbar.getByRole('button', { name: 'Task list' }).click();
    await expect.poll(() => sourceText(window)).toMatch(/^- \[ \] Title$/);
    await toolbar.getByRole('button', { name: 'Quote' }).click();
    await expect.poll(() => sourceText(window)).toMatch(/^> /);
  });

  test('inserts links, tables, code blocks and rules', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    const toolbar = window.getByRole('toolbar', { name: 'Formatting' });
    await window.keyboard.type('site', { delay: 10 });
    await window.keyboard.press('Shift+Home');
    await toolbar.getByRole('button', { name: 'Link' }).click();
    await expect.poll(() => sourceText(window)).toBe('[site](https://)');
    // The URL placeholder is selected so it can be typed over.
    await window.keyboard.type('https://example.com', { delay: 5 });
    await expect.poll(() => sourceText(window)).toBe('[site](https://example.com)');

    await window.keyboard.press('ControlOrMeta+End');
    await toolbar.getByRole('button', { name: 'Table' }).click();
    const withTable = await sourceText(window);
    expect(withTable).toContain('| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |');

    await window.keyboard.press('ControlOrMeta+End');
    await toolbar.getByRole('button', { name: 'Horizontal rule' }).click();
    await expect.poll(() => sourceText(window)).toMatch(/\n---\n?$/);

    await window.keyboard.press('ControlOrMeta+End');
    await pressShortcut(app, 'CmdOrCtrl+Alt+C');
    await expect.poll(() => sourceText(window)).toMatch(/\n---\n```\n\n```$/);
  });

  test('undo and redo work through the shortcuts', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    await window.keyboard.type('first', { delay: 10 });
    await expect.poll(() => sourceText(window)).toBe('first');
    await pressShortcut(app, 'CmdOrCtrl+Z');
    await expect.poll(() => sourceText(window)).toBe('');
    await pressShortcut(app, 'CmdOrCtrl+Shift+Z');
    await expect.poll(() => sourceText(window)).toBe('first');
  });

  test('brackets are closed automatically', async ({ launch }) => {
    const app = await launch(SOURCE_DEFAULT);
    const window = await newSourceDocument(app);
    await window.keyboard.type('(', { delay: 10 });
    await expect.poll(() => sourceText(window)).toBe('()');
    await window.keyboard.type('x)', { delay: 10 });
    await expect.poll(() => sourceText(window)).toBe('(x)');
  });
});
