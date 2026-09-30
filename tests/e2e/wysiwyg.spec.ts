import type { Page } from '@playwright/test';
import {
  expect,
  pressShortcut,
  sourceText,
  switchMode,
  test,
  visualEditor,
  type LaunchedApp,
} from './fixtures';

/** Keystroke delay: the Visual editor re-renders list/code node views asynchronously after input rules. */
const TYPING = { delay: 25 } as const;

async function newVisualDocument(app: LaunchedApp): Promise<Page> {
  const { window } = app;
  await window.getByRole('button', { name: 'New document' }).first().click();
  await visualEditor(window).click();
  await expect(visualEditor(window)).toBeFocused();
  return window;
}

/**
 * Presses Enter and waits two animation frames, so the new list item's node
 * view has settled before the next keys arrive. Keys typed right after Enter
 * are covered separately by `editor-fixes.spec.ts`.
 */
async function enter(window: Page): Promise<void> {
  await window.keyboard.press('Enter');
  await window.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const raf = (globalThis as unknown as { requestAnimationFrame(cb: () => void): number })
          .requestAnimationFrame;
        raf(() => raf(() => resolve()));
      }),
  );
}

async function markdownOf(window: Page): Promise<string> {
  await switchMode(window, 'Markdown');
  const text = await sourceText(window);
  await switchMode(window, 'Visual');
  return text;
}

test.describe('Visual mode (WYSIWYG)', () => {
  test('markdown shortcuts create headings, emphasis and lists while typing', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.keyboard.type('# Big title', TYPING);
    await expect(editor.getByRole('heading', { level: 1, name: 'Big title' })).toBeVisible();
    await enter(window);
    await window.keyboard.type('## Smaller', TYPING);
    await expect(editor.getByRole('heading', { level: 2, name: 'Smaller' })).toBeVisible();
    await enter(window);
    await window.keyboard.type('Some **bold** and *italic* words', TYPING);
    await expect(editor.locator('strong')).toHaveText('bold');
    await expect(editor.locator('em')).toHaveText('italic');
    await enter(window);
    await window.keyboard.type('- apple', TYPING);
    await enter(window);
    await window.keyboard.type('banana', TYPING);
    await enter(window);
    await enter(window);
    await window.keyboard.type('1. first', TYPING);
    await enter(window);
    await window.keyboard.type('second', TYPING);
    await expect(editor.locator('ul')).toHaveCount(1);
    await expect(editor.locator('ol')).toHaveCount(1);

    expect(await markdownOf(window)).toBe(
      [
        '# Big title',
        '',
        '## Smaller',
        '',
        'Some **bold** and *italic* words',
        '',
        '- apple',
        '- banana',
        '',
        '1. first',
        '2. second',
        '',
      ].join('\n'),
    );
  });

  test('task list items are created by typing and toggled by clicking', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.keyboard.type('- [ ] write tests', TYPING);
    await enter(window);
    await window.keyboard.type('ship it', TYPING);
    const labels = editor.locator('.list-item .label-wrapper .label');
    await expect(labels).toHaveCount(2);
    await expect(labels.nth(0)).toHaveClass(/unchecked/);
    await expect(labels.nth(1)).toHaveClass(/unchecked/);

    await labels.nth(0).click();
    await expect(labels.nth(0)).toHaveClass(/(^|\s)checked(\s|$)/);
    expect(await markdownOf(window)).toBe('- [x] write tests\n- [ ] ship it\n');
  });

  test('a fenced code block with a language is created by typing', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.keyboard.type('```ts', TYPING);
    await enter(window);
    const block = editor.locator('.milkdown-code-block');
    await expect(block).toBeVisible();
    await expect(block.locator('.language-button')).toHaveText(/ts/);
    await window.keyboard.type('const answer: number = 42;', TYPING);
    await expect(block.locator('.cm-content')).toHaveText('const answer: number = 42;');
    expect(await markdownOf(window)).toBe('```ts\nconst answer: number = 42;\n```\n');
  });

  test('toolbar buttons format the current block and selection', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    const toolbar = window.getByRole('toolbar', { name: 'Formatting' });
    await window.keyboard.type('Heading from toolbar', TYPING);
    await toolbar.getByRole('button', { name: 'Heading 2' }).click();
    await expect(editor.getByRole('heading', { level: 2, name: 'Heading from toolbar' })).toBeVisible();
    await window.keyboard.press('End');
    await enter(window);
    await window.keyboard.type('quoted text', TYPING);
    await toolbar.getByRole('button', { name: 'Quote' }).click();
    await expect(editor.locator('blockquote')).toHaveText('quoted text');
    await editor.locator('blockquote p').selectText();
    await toolbar.getByRole('button', { name: 'Italic' }).click();
    await expect(editor.locator('blockquote em')).toHaveText('quoted text');

    expect(await markdownOf(window)).toBe('## Heading from toolbar\n\n> *quoted text*\n');
  });

  test('the toolbar inserts a table', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Table' }).click();
    const table = editor.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).not.toHaveCount(0);
    const markdown = await markdownOf(window);
    expect(markdown).toMatch(/^\|.*\|\n\| *:?-+/m);
  });

  test('the slash menu inserts a block', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.keyboard.type('/', TYPING);
    const menu = window.locator('.milkdown-slash-menu');
    await expect(menu).toBeVisible();
    await menu.locator('.menu-groups li').getByText('Heading 2', { exact: true }).click();
    await expect(menu).toBeHidden();
    await window.keyboard.type('From the slash menu', TYPING);
    await expect(editor.getByRole('heading', { level: 2, name: 'From the slash menu' })).toBeVisible();
    expect(await markdownOf(window)).toBe('## From the slash menu\n');
  });

  test('the bold shortcut toggles exactly once per key press', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.keyboard.type('toggle me', TYPING);
    await window.keyboard.press('Shift+Home');

    // Routed by the main process (before-input-event), like a real key press.
    await pressShortcut(mpp, 'CmdOrCtrl+B');
    await expect(editor.locator('strong')).toHaveText('toggle me');
    await pressShortcut(mpp, 'CmdOrCtrl+B');
    await expect(editor.locator('strong')).toHaveCount(0);
    await pressShortcut(mpp, 'CmdOrCtrl+B');
    await expect(editor.locator('strong')).toHaveText('toggle me');
    await pressShortcut(mpp, 'CmdOrCtrl+I');
    await expect(editor.locator('strong em, em strong')).toHaveText('toggle me');

    expect(await markdownOf(window)).toBe('***toggle me***\n');
  });

  test('undo and redo shortcuts revert and restore typing', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    const editor = visualEditor(window);
    await window.keyboard.type('keep', TYPING);
    await expect(editor).toContainText('keep');
    await pressShortcut(mpp, 'CmdOrCtrl+Z');
    await expect(editor).not.toContainText('keep');
    await pressShortcut(mpp, 'CmdOrCtrl+Shift+Z');
    await expect(editor).toContainText('keep');
  });
});
