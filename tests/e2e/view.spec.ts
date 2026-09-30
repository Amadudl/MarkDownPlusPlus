import { expect, pressShortcut, test } from './fixtures';

test.describe('View', () => {
  test('the outline lists the headings of the active document', async ({ launch, workspace }) => {
    const path = await workspace.write('outline.md', '# One\n\ntext\n\n## Two\n\ntext\n\n### Three\n');
    const app = await launch({ files: [path] });
    const { window } = app;
    await expect(window.getByRole('complementary', { name: 'Outline' })).toHaveCount(0);
    await pressShortcut(app, 'CmdOrCtrl+Shift+O');
    const outline = window.getByRole('complementary', { name: 'Outline' });
    await expect(outline).toBeVisible();
    const headings = outline.getByRole('navigation', { name: 'Document headings' });
    await expect(headings).toContainText('One');
    await expect(headings).toContainText('Two');
    await expect(headings).toContainText('Three');
    await pressShortcut(app, 'CmdOrCtrl+Shift+O');
    await expect(outline).toHaveCount(0);
  });

  test('focus mode hides the chrome and can be left again', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    const toolbar = window.getByRole('toolbar', { name: 'Formatting' });
    const status = window.getByRole('contentinfo', { name: 'Status bar' });
    await expect(toolbar).toBeVisible();
    await pressShortcut(app, 'CmdOrCtrl+Shift+F');
    await expect(window.locator('.app')).toHaveClass(/is-focus-mode/);
    await expect(toolbar).toHaveCount(0);
    await expect(status).toHaveCount(0);
    await window.getByRole('button', { name: 'Exit focus mode' }).click();
    await expect(toolbar).toBeVisible();
    await expect(status).toBeVisible();
  });

  test('the formatting toolbar can be hidden and shown', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    const toolbar = window.getByRole('toolbar', { name: 'Formatting' });
    await window.getByRole('button', { name: 'Hide formatting toolbar' }).click();
    await expect(toolbar).toHaveCount(0);
    await window.getByRole('button', { name: 'Show formatting toolbar' }).click();
    await expect(toolbar).toBeVisible();
    // Arrow keys move the focus between toolbar buttons (roving tab index).
    await toolbar.getByRole('button', { name: 'Bold' }).focus();
    await window.keyboard.press('ArrowRight');
    await expect(toolbar.getByRole('button', { name: 'Italic' })).toBeFocused();
    await window.keyboard.press('End');
    await expect(toolbar.getByRole('button', { name: 'Find', exact: true })).toBeFocused();
  });
});
