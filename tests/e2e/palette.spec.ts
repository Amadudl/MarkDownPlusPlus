import type { Page } from '@playwright/test';
import { expect, IS_MAC, pressShortcut, sourceEditor, tab, test } from './fixtures';

function palette(window: Page) {
  const dialog = window.getByRole('dialog', { name: 'Command palette' });
  return {
    dialog,
    input: dialog.getByRole('combobox', { name: 'Search commands and recent files' }),
    options: dialog.getByRole('listbox', { name: 'Commands' }).getByRole('option'),
    selected: dialog.getByRole('option', { selected: true }),
  };
}

test.describe('Command palette', () => {
  test('opens with the shortcut, filters fuzzily and runs a command with Enter', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    await pressShortcut(app, 'CmdOrCtrl+Shift+P');
    const ui = palette(window);
    await expect(ui.dialog).toBeVisible();
    await expect(ui.input).toBeFocused();
    await expect(ui.options.first()).toBeVisible();
    await expect(ui.options.first()).toHaveAttribute('aria-selected', 'true');

    await ui.input.fill('swmark');
    await expect(ui.options.first()).toContainText('Switch to Markdown Mode');
    await expect(ui.options.first().locator('mark').first()).toBeVisible();
    await ui.input.press('Enter');
    await expect(ui.dialog).toBeHidden();
    await expect(sourceEditor(window)).toBeVisible();
  });

  test('arrow keys move the selection and Escape closes it', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    await window.getByRole('button', { name: 'Command palette' }).click();
    const ui = palette(window);
    await ui.input.fill('zoom');
    await expect(ui.options).toHaveCount(3);
    const first = (await ui.options.nth(0).textContent()) ?? '';
    await ui.input.press('ArrowDown');
    await expect(ui.options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(ui.input).toHaveAttribute(
      'aria-activedescendant',
      (await ui.options.nth(1).getAttribute('id')) ?? '',
    );
    await ui.input.press('ArrowUp');
    await ui.input.press('ArrowUp');
    await expect(ui.options.nth(2)).toHaveAttribute('aria-selected', 'true');
    await ui.input.press('Home');
    await expect(ui.selected).toHaveText(first);
    await ui.input.press('Escape');
    await expect(ui.dialog).toBeHidden();
  });

  test('shows shortcuts next to commands and a message when nothing matches', async ({ mpp }) => {
    const { window } = mpp;
    await window.getByRole('button', { name: 'Command palette' }).click();
    const ui = palette(window);
    await ui.input.fill('Toggle Visual');
    const toggle = ui.options.filter({ hasText: 'Toggle Visual / Markdown Mode' });
    await expect(toggle).toContainText(IS_MAC ? '⌘E' : 'Ctrl+E');
    await expect(toggle).toContainText('View');
    await ui.input.fill('qqqqzzzz');
    await expect(ui.options).toHaveCount(0);
    await expect(ui.dialog).toContainText('No matching commands');
  });

  test('lists recent files and opens them', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('third.md')] });
    const { window } = app;
    await window.getByRole('button', { name: 'Close third.md' }).click();
    await window.getByRole('button', { name: 'Command palette' }).click();
    const ui = palette(window);
    const recent = ui.options.filter({ hasText: 'third.md' });
    await expect(recent).toBeVisible();
    await expect(recent).toContainText(workspace.dir);
    await recent.click();
    await expect(ui.dialog).toBeHidden();
    await expect(tab(window, 'third.md')).toHaveAttribute('aria-selected', 'true');
  });

  test('opens the keyboard shortcuts and about dialogs', async ({ mpp }) => {
    const { window } = mpp;
    await window.getByRole('button', { name: 'Command palette' }).click();
    await palette(window).input.fill('Keyboard Shortcuts');
    await palette(window).input.press('Enter');
    const shortcuts = window.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(shortcuts).toBeVisible();
    await expect(shortcuts).toContainText('Command Palette');
    await window.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();

    await pressShortcut(mpp, 'CmdOrCtrl+Shift+P');
    await palette(window).input.fill('About MarkDown');
    await palette(window).input.press('Enter');
    const about = window.getByRole('dialog', { name: 'About MarkDown++' });
    await expect(about).toBeVisible();
    await expect(about).toContainText('1.0.0');
  });

  test('the shortcut toggles the palette closed again', async ({ mpp }) => {
    const { window } = mpp;
    await pressShortcut(mpp, 'CmdOrCtrl+Shift+P');
    await expect(palette(window).dialog).toBeVisible();
    await pressShortcut(mpp, 'CmdOrCtrl+Shift+P');
    await expect(palette(window).dialog).toBeHidden();
  });
});
