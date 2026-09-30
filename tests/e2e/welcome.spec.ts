import { expect, saveState, tab, tabs, test, visualEditor } from './fixtures';

test.describe('Welcome screen', () => {
  test('is shown on a fresh start with its actions and hints', async ({ mpp }) => {
    const { window } = mpp;
    await expect(window.getByRole('heading', { level: 1, name: 'MarkDown++' })).toBeVisible();
    await expect(window.getByRole('button', { name: /New document/ }).first()).toBeVisible();
    await expect(window.getByRole('button', { name: /Open file…/ })).toBeVisible();
    await expect(window.getByRole('button', { name: /Open the tutorial/ })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Good to know' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Recent' })).toHaveCount(0);
    await expect(tabs(window)).toHaveCount(0);
    await expect(window.getByRole('toolbar', { name: 'Formatting' })).toHaveCount(0);
    await expect(window.getByRole('contentinfo', { name: 'Status bar' })).toContainText('Ready');
    await expect(window).toHaveTitle('MarkDown++');
    // Without a document the mode switch cannot be used.
    const modes = window.getByRole('radiogroup', { name: 'Editor mode' });
    await expect(modes).toHaveAttribute('aria-disabled', 'true');
    await expect(modes.getByRole('radio', { name: 'Visual' })).toBeDisabled();
  });

  test('"New document" opens an empty, clean Visual mode document', async ({ mpp }) => {
    const { window } = mpp;
    await window
      .locator('.welcome')
      .getByRole('button', { name: /New document/ })
      .click();
    await expect(tab(window, 'Untitled-1')).toHaveAttribute('aria-selected', 'true');
    await expect(visualEditor(window)).toBeVisible();
    await expect(saveState(window)).toHaveText(/Not saved yet/);
    await expect(window.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
    await expect(
      window.getByRole('radiogroup', { name: 'Editor mode' }).getByRole('radio', { name: 'Visual' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('"Open the tutorial" opens the bundled guide as a clean document', async ({ mpp }) => {
    const { window } = mpp;
    await window.getByRole('button', { name: /Open the tutorial/ }).click();
    const tutorial = tab(window, 'Welcome to MarkDown++');
    await expect(tutorial).toBeVisible();
    await expect(visualEditor(window).getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(saveState(window)).toHaveText(/Not saved yet/);

    await window.getByRole('button', { name: 'Command palette' }).click();
    await window.getByRole('combobox', { name: 'Search commands and recent files' }).fill('New Document');
    await window.getByRole('option', { name: /New Document/ }).click();
    await expect(tabs(window)).toHaveCount(2);
    await tab(window, 'Welcome to MarkDown++').click();
    await expect(tutorial).toHaveAttribute('aria-selected', 'true');
  });

  test('"Open file…" opens the files picked in the dialog', async ({ mpp, workspace }) => {
    const { window } = mpp;
    await mpp.stubs.queueOpen([workspace.path('notes.md'), workspace.path('second.md')]);
    await window.getByRole('button', { name: /Open file…/ }).click();
    await expect(tabs(window)).toHaveCount(2);
    await expect(tab(window, 'notes.md')).toBeVisible();
    await expect(tab(window, 'second.md')).toBeVisible();
    const opens = await mpp.stubs.calls('open');
    expect(opens).toHaveLength(1);
    expect(opens[0]?.detail).toBe('Open Markdown Files');
  });

  test('a cancelled "Open file…" keeps the welcome screen', async ({ mpp }) => {
    const { window } = mpp;
    await mpp.stubs.queueOpen([]);
    await window.getByRole('button', { name: /Open file…/ }).click();
    await expect.poll(async () => (await mpp.stubs.calls('open')).length).toBe(1);
    await expect(window.getByRole('heading', { level: 1, name: 'MarkDown++' })).toBeVisible();
    await expect(tabs(window)).toHaveCount(0);
  });

  test('lists recently opened files and reopens them', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    await expect(tab(window, 'notes.md')).toBeVisible();
    await window.getByRole('button', { name: 'Close notes.md' }).click();
    await expect(tabs(window)).toHaveCount(0);

    const recent = window.getByRole('region', { name: 'Recent' });
    const entry = recent.getByRole('button', { name: /notes\.md/ });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('title', workspace.path('notes.md'));
    await entry.click();
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
    await expect(visualEditor(window).getByRole('heading', { name: 'Notes' })).toBeVisible();
  });

  test('can be turned off; the next start then opens an empty document', async ({ launch }) => {
    const first = await launch();
    const checkbox = first.window.getByRole('checkbox', { name: /Show this screen/ });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await first.close();

    const second = await launch();
    await expect(tab(second.window, 'Untitled-1')).toBeVisible();
    await expect(second.window.locator('.welcome')).toHaveCount(0);
  });
});
