import { rm } from 'node:fs/promises';
import { expect, sourceText, switchMode, tab, tabs, test, visualEditor } from './fixtures';

test.describe('Session restore', () => {
  test('reopens the files, their modes and the active tab after a relaunch', async ({
    launch,
    workspace,
  }) => {
    const first = await launch({
      files: [workspace.path('notes.md'), workspace.path('second.md'), workspace.path('third.md')],
    });
    await tab(first.window, 'second.md').click();
    await switchMode(first.window, 'Markdown');
    await tab(first.window, 'notes.md').click();
    // Untitled documents are not part of a session.
    await first.window.getByRole('button', { name: 'New document' }).first().click();
    await tab(first.window, 'notes.md').click();
    await first.close();

    const second = await launch();
    const { window } = second;
    await expect(tabs(window)).toHaveCount(3);
    await expect(tabs(window).nth(0)).toContainText('notes.md');
    await expect(tabs(window).nth(1)).toContainText('second.md');
    await expect(tabs(window).nth(2)).toContainText('third.md');
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
    await expect(visualEditor(window).getByRole('heading', { name: 'Notes' })).toBeVisible();
    await tab(window, 'second.md').click();
    await expect(
      window.getByRole('radiogroup', { name: 'Editor mode' }).getByRole('radio', { name: 'Markdown' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(await sourceText(window)).toBe('# Second\n\nAnother document.\n');
  });

  test('reports files that no longer exist', async ({ launch, workspace }) => {
    const first = await launch({ files: [workspace.path('notes.md'), workspace.path('third.md')] });
    await expect(tabs(first.window)).toHaveCount(2);
    await first.close();
    await rm(workspace.path('third.md'));

    // Electron logs every rejected IPC handler in the main process (reported as a finding).
    const second = await launch({
      allowConsole: [/Error occurred in handler for 'file:read': Error: ENOENT/],
    });
    await expect(tabs(second.window)).toHaveCount(1);
    await expect(tab(second.window, 'notes.md')).toBeVisible();
    await expect(
      second.window.getByRole('status').filter({ hasText: 'third.md could not be reopened.' }),
    ).toBeVisible();
  });

  test('does not restore anything when session restore is turned off', async ({ launch, workspace }) => {
    const first = await launch({ files: [workspace.path('notes.md')] });
    await first.window.getByRole('button', { name: 'Settings' }).click();
    const dialog = first.window.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('tab', { name: 'Editor' }).click();
    const toggle = dialog.getByRole('switch', { name: 'Restore session' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await first.close();

    const second = await launch();
    await expect(second.window.getByRole('heading', { level: 1, name: 'MarkDown++' })).toBeVisible();
    await expect(tabs(second.window)).toHaveCount(0);
  });
});
