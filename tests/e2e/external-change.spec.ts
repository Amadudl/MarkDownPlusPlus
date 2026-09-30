import { rm } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, pressShortcut, saveState, tab, test, visualEditor, type Workspace } from './fixtures';

/**
 * Writes `content` to a file until the editor shows `marker`: the watcher is
 * attached asynchronously after a document opens, so the first write may
 * happen before it listens.
 */
async function changeOnDisk(workspace: Workspace, name: string, content: string, check: () => Promise<void>) {
  await expect(async () => {
    await workspace.write(name, content);
    await check();
  }).toPass({ timeout: 15_000, intervals: [250, 500, 1000] });
}

function banner(window: Page) {
  return window.locator('.change-banner[role="alert"]');
}

test.describe('External changes', () => {
  test('a clean document reloads automatically', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    const editor = visualEditor(window);
    await expect(editor.getByRole('heading', { name: 'Notes' })).toBeVisible();

    await changeOnDisk(workspace, 'notes.md', '# Changed outside\n\nNew body.\n', async () => {
      await expect(editor.getByRole('heading', { name: 'Changed outside' })).toBeVisible({ timeout: 2000 });
    });
    await expect(editor).toContainText('New body.');
    await expect(saveState(window)).toHaveText(/Saved/);
    await expect(banner(window)).toHaveCount(0);
    await expect(
      window.getByRole('status').filter({ hasText: 'notes.md was updated from disk.' }),
    ).toBeVisible();
  });

  test('a dirty document shows a banner and can reload from disk', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    const editor = visualEditor(window);
    await editor.getByText('Another document.').click();
    await window.keyboard.press('End');
    await window.keyboard.type(' Mine.', { delay: 20 });
    await expect(tab(window, 'second.md')).toHaveClass(/is-dirty/);

    await changeOnDisk(workspace, 'second.md', '# Theirs\n\nFrom another program.\n', async () => {
      await expect(banner(window)).toBeVisible({ timeout: 2000 });
    });
    await expect(banner(window)).toContainText('second.md was changed on disk by another program.');
    await expect(editor).toContainText('Another document. Mine.');

    await banner(window).getByRole('button', { name: 'Reload from disk' }).click();
    await expect(banner(window)).toHaveCount(0);
    await expect(editor.getByRole('heading', { name: 'Theirs' })).toBeVisible();
    await expect(tab(window, 'second.md')).not.toHaveClass(/is-dirty/);
  });

  test('"Keep mine" dismisses the banner and keeps the edits', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    const editor = visualEditor(window);
    await editor.getByText('Another document.').click();
    await window.keyboard.press('End');
    await window.keyboard.type(' Mine.', { delay: 20 });

    await changeOnDisk(workspace, 'second.md', '# Theirs\n', async () => {
      await expect(banner(window)).toBeVisible({ timeout: 2000 });
    });
    await banner(window).getByRole('button', { name: 'Keep mine' }).click();
    await expect(banner(window)).toHaveCount(0);
    await expect(editor).toContainText('Another document. Mine.');
    await expect(tab(window, 'second.md')).toHaveClass(/is-dirty/);

    await pressShortcut(app, 'CmdOrCtrl+S');
    await expect(saveState(window)).toHaveText(/Saved/);
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document. Mine.\n');
  });

  test('saving from the app does not count as an external change', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    const editor = visualEditor(window);
    await editor.getByText('Another document.').click();
    await window.keyboard.press('End');
    await window.keyboard.type(' Saved here.', { delay: 20 });
    await pressShortcut(app, 'CmdOrCtrl+S');
    await expect(saveState(window)).toHaveText(/Saved/);
    await window.keyboard.type(' More.', { delay: 20 });
    await expect(saveState(window)).toHaveText(/Unsaved/);
    // Give a (wrong) watcher event time to arrive; the banner must never appear.
    await expect(banner(window)).toHaveCount(0);
    await expect(window.getByRole('status').filter({ hasText: 'was updated from disk' })).toHaveCount(0);
    await expect(editor).toContainText('Another document. Saved here. More.');
  });

  test('a deleted file can be closed from the banner', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md'), workspace.path('third.md')] });
    const { window } = app;
    await rm(workspace.path('third.md'));
    await expect(banner(window)).toContainText('third.md was deleted or moved on disk.', { timeout: 15_000 });
    await banner(window).getByRole('button', { name: 'Close' }).click();
    await expect(tab(window, 'third.md')).toHaveCount(0);
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
  });

  test('a deleted file shows a banner offering to keep or close it', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md'), workspace.path('third.md')] });
    const { window } = app;
    await expect(tab(window, 'third.md')).toHaveAttribute('aria-selected', 'true');
    await rm(workspace.path('third.md'));
    await expect(banner(window)).toContainText('third.md was deleted or moved on disk.', { timeout: 15_000 });
    await expect(tab(window, 'third.md')).not.toHaveClass(/is-dirty/);

    await banner(window).getByRole('button', { name: 'Keep as unsaved' }).click();
    await expect(banner(window)).toHaveCount(0);
    await expect(tab(window, 'third.md')).toHaveClass(/is-dirty/);

    // Saving writes the kept document back to its original location.
    await pressShortcut(app, 'CmdOrCtrl+S');
    await expect(tab(window, 'third.md')).not.toHaveClass(/is-dirty/);
    expect(await workspace.read('third.md')).toBe('# Third\n\nYet another document.\n');
  });
});
