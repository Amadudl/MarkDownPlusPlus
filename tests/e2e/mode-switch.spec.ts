import type { Page } from '@playwright/test';
import { stat } from 'node:fs/promises';
import {
  expect,
  pressShortcut,
  saveState,
  sourceEditor,
  sourceText,
  switchMode,
  tab,
  test,
  visualEditor,
} from './fixtures';

/** Markdown that a WYSIWYG editor would typically normalise (bullets, emphasis, setext, tables, …). */
const MIXED_MARKDOWN = [
  'Setext Title',
  '============',
  '',
  'Some __bold__ and *italic* text with `code` and a [link](https://example.com "Title").',
  '',
  '* star bullet',
  '* another one',
  '',
  '1) first',
  '2) second',
  '',
  '| Left | Center | Right |',
  '|:-----|:------:|------:|',
  '| a    |   b    |     c |',
  '',
  '```js',
  'const answer = 42;',
  '```',
  '',
  '> Quote line',
  '',
  '- [x] done',
  '- [ ] open',
  '',
  '***',
  '',
  'Trailing paragraph\\',
  'with a hard break.',
  '',
].join('\n');

const modeRadio = (window: Page, name: 'Visual' | 'Markdown') =>
  window.getByRole('radiogroup', { name: 'Editor mode' }).getByRole('radio', { name });

test.describe('Mode switch', () => {
  test('Visual → Markdown → Visual keeps an unedited document byte-identical', async ({
    launch,
    workspace,
  }) => {
    const path = await workspace.write('mixed.md', MIXED_MARKDOWN);
    const before = (await stat(path)).mtimeMs;
    const app = await launch({ files: [path] });
    const { window } = app;
    await expect(visualEditor(window).getByRole('heading', { name: 'Setext Title' })).toBeVisible();

    await switchMode(window, 'Markdown');
    expect(await sourceText(window)).toBe(MIXED_MARKDOWN);
    await switchMode(window, 'Visual');
    await expect(visualEditor(window).getByRole('table')).toBeVisible();
    await switchMode(window, 'Markdown');
    expect(await sourceText(window)).toBe(MIXED_MARKDOWN);
    await expect(saveState(window)).toHaveText(/Saved/);
    await expect(tab(window, 'mixed.md')).not.toHaveClass(/is-dirty/);

    await pressShortcut(app, 'CmdOrCtrl+S');
    await expect.poll(async () => (await stat(path)).mtimeMs).toBeGreaterThan(before);
    expect(await workspace.read('mixed.md')).toBe(MIXED_MARKDOWN);
  });

  test('edits made in Visual mode appear in Markdown mode', async ({ mpp }) => {
    const { window } = mpp;
    await window.getByRole('button', { name: 'New document' }).first().click();
    await visualEditor(window).click();
    await window.keyboard.type('# Visual heading', { delay: 20 });
    await window.keyboard.press('Enter');
    await window.keyboard.type('Plain and ', { delay: 20 });
    await window.getByRole('button', { name: 'Bold', exact: true }).click();
    await window.keyboard.type('strong', { delay: 20 });
    await expect(visualEditor(window).locator('strong')).toHaveText('strong');

    await switchMode(window, 'Markdown');
    expect(await sourceText(window)).toBe('# Visual heading\n\nPlain and **strong**\n');
  });

  test('edits made in Markdown mode appear in Visual mode', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    await switchMode(window, 'Markdown');
    await sourceEditor(window).click();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.type('\n## Added in source\n\n- item *one*', { delay: 10 });
    await expect(saveState(window)).toHaveText(/Unsaved/);

    await switchMode(window, 'Visual');
    const editor = visualEditor(window);
    await expect(editor.getByRole('heading', { level: 2, name: 'Added in source' })).toBeVisible();
    await expect(editor.locator('li em')).toHaveText('one');
    await switchMode(window, 'Markdown');
    expect(await sourceText(window)).toBe(
      '# Second\n\nAnother document.\n\n## Added in source\n\n- item *one*',
    );
  });

  test('the keyboard shortcut toggles between the modes', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    // The shortcut is a no-op until the document is open, so wait for it to be loaded.
    await expect(visualEditor(window).getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expect(modeRadio(window, 'Visual')).toBeEnabled();
    await expect(modeRadio(window, 'Visual')).toHaveAttribute('aria-checked', 'true');
    await pressShortcut(app, 'CmdOrCtrl+E');
    await expect(modeRadio(window, 'Markdown')).toHaveAttribute('aria-checked', 'true');
    await expect(sourceEditor(window)).toBeVisible();
    await expect(visualEditor(window)).toHaveCount(0);
    await pressShortcut(app, 'CmdOrCtrl+E');
    await expect(modeRadio(window, 'Visual')).toHaveAttribute('aria-checked', 'true');
    await expect(visualEditor(window)).toBeVisible();
    await expect(sourceEditor(window)).toHaveCount(0);
  });

  test('arrow keys on the mode switch and the status bar button switch modes', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    await expect(modeRadio(window, 'Visual')).toBeEnabled();
    await modeRadio(window, 'Visual').focus();
    await window.keyboard.press('ArrowRight');
    await expect(modeRadio(window, 'Markdown')).toHaveAttribute('aria-checked', 'true');
    await expect(modeRadio(window, 'Markdown')).toBeFocused();
    await expect(sourceEditor(window)).toBeVisible();

    // The CSS tooltip text is part of the accessible name, hence the prefix match.
    const statusMode = window
      .getByRole('contentinfo', { name: 'Status bar' })
      .getByRole('button', { name: /^Markdown/ });
    await statusMode.click();
    await expect(modeRadio(window, 'Visual')).toHaveAttribute('aria-checked', 'true');
    await expect(visualEditor(window)).toBeVisible();
  });

  test('each tab remembers its own mode', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md'), workspace.path('second.md')] });
    const { window } = app;
    await switchMode(window, 'Markdown');
    await tab(window, 'notes.md').click();
    await expect(modeRadio(window, 'Visual')).toHaveAttribute('aria-checked', 'true');
    await expect(visualEditor(window)).toBeVisible();
    await tab(window, 'second.md').click();
    await expect(modeRadio(window, 'Markdown')).toHaveAttribute('aria-checked', 'true');
    expect(await sourceText(window)).toBe('# Second\n\nAnother document.\n');
  });
});
