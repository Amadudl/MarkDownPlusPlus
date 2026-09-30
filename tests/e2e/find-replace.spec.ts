import type { Page } from '@playwright/test';
import {
  expect,
  IS_MAC,
  pressShortcut,
  sourceText,
  switchMode,
  test,
  visualEditor,
  type LaunchedApp,
} from './fixtures';

const PETS = '# Pets\n\nThe cat and the Cat met a caterpillar.\n\nNo more cats here.\n';

function findBar(window: Page) {
  const bar = window.getByRole('search', { name: 'Find and replace' });
  return {
    bar,
    find: bar.getByRole('textbox', { name: 'Find', exact: true }),
    replace: bar.getByRole('textbox', { name: 'Replace', exact: true }),
    count: bar.locator('.findbar-count'),
    toggle: (name: 'Match case' | 'Match whole word' | 'Use regular expression') =>
      bar.getByRole('button', { name }),
    button: (name: string) => bar.getByRole('button', { name, exact: true }),
  };
}

/** Opens find and replace through the toolbar button and the "Show replace" toggle. */
async function openReplace(app: LaunchedApp): Promise<void> {
  await app.window
    .getByRole('toolbar', { name: 'Formatting' })
    .getByRole('button', { name: 'Find', exact: true })
    .click();
  await findBar(app.window).bar.getByRole('button', { name: 'Show replace' }).click();
}

async function openPets(launch: (options?: { files?: string[] }) => Promise<LaunchedApp>, path: string) {
  const app = await launch({ files: [path] });
  await expect(visualEditor(app.window).getByRole('heading', { name: 'Pets' })).toBeVisible();
  return app;
}

for (const mode of ['Visual', 'Markdown'] as const) {
  test.describe(`Find and replace in ${mode} mode`, () => {
    test('counts matches and honours case, whole word and regular expressions', async ({
      launch,
      workspace,
    }) => {
      const app = await openPets(launch, await workspace.write('pets.md', PETS));
      const { window } = app;
      if (mode === 'Markdown') await switchMode(window, 'Markdown');
      await pressShortcut(app, 'CmdOrCtrl+F');
      const ui = findBar(window);
      await expect(ui.find).toBeFocused();
      await expect(ui.replace).toHaveCount(0);

      await ui.find.fill('cat');
      await expect(ui.count).toHaveText('1 of 4');
      await ui.button('Next match').click();
      await expect(ui.count).toHaveText('2 of 4');
      await ui.find.press('Enter');
      await expect(ui.count).toHaveText('3 of 4');
      await ui.find.press('Shift+Enter');
      await expect(ui.count).toHaveText('2 of 4');

      await ui.toggle('Match case').click();
      await expect(ui.toggle('Match case')).toHaveAttribute('aria-pressed', 'true');
      await expect(ui.count).toHaveText(/of 3$/);
      await ui.toggle('Match whole word').click();
      await expect(ui.count).toHaveText(/of 1$/);
      await ui.toggle('Match case').click();
      await expect(ui.count).toHaveText(/of 2$/);
      await ui.toggle('Match whole word').click();

      await ui.toggle('Use regular expression').click();
      await ui.find.fill('cat(erpillar|s)');
      await expect(ui.count).toHaveText(/of 2$/);
      await ui.find.fill('(');
      await expect(ui.find).toHaveAttribute('aria-invalid', 'true');
      await expect(ui.count).not.toHaveText(/of|No results/);
      await expect(ui.count).not.toHaveText('');
      await ui.find.fill('dog');
      await expect(ui.count).toHaveText('No results');
      await expect(ui.button('Next match')).toBeDisabled();

      await ui.find.press('Escape');
      await expect(ui.bar).toBeHidden();
    });

    test('replaces the current match and all matches', async ({ launch, workspace }) => {
      const app = await openPets(launch, await workspace.write('pets.md', PETS));
      const { window } = app;
      if (mode === 'Markdown') await switchMode(window, 'Markdown');
      await openReplace(app);
      const ui = findBar(window);
      await expect(ui.replace).toBeVisible();
      await ui.find.fill('cat');
      await ui.toggle('Match whole word').click();
      await expect(ui.count).toHaveText('1 of 2');
      await ui.replace.fill('dog');
      await ui.button('Replace').click();
      await expect(ui.count).toHaveText(/of 1$/);
      await ui.button('Replace all').click();
      await expect(ui.count).toHaveText('No results');

      await ui.button('Close').click();
      await expect(ui.bar).toBeHidden();
      if (mode === 'Visual') await switchMode(window, 'Markdown');
      await expect
        .poll(() => sourceText(window))
        .toBe('# Pets\n\nThe dog and the dog met a caterpillar.\n\nNo more cats here.\n');
    });
  });
}

test('the replace row can be toggled from the find bar', async ({ launch, workspace }) => {
  const app = await openPets(launch, await workspace.write('pets.md', PETS));
  const { window } = app;
  await window
    .getByRole('toolbar', { name: 'Formatting' })
    .getByRole('button', { name: 'Find', exact: true })
    .click();
  const ui = findBar(window);
  await expect(ui.find).toBeFocused();
  await ui.bar.getByRole('button', { name: 'Show replace' }).click();
  await expect(ui.replace).toBeVisible();
  await ui.bar.getByRole('button', { name: 'Hide replace' }).click();
  await expect(ui.replace).toHaveCount(0);
});

test('replace all with a regular expression in Markdown mode', async ({ launch, workspace }) => {
  const app = await openPets(launch, await workspace.write('pets.md', PETS));
  const { window } = app;
  await switchMode(window, 'Markdown');
  await openReplace(app);
  const ui = findBar(window);
  await ui.toggle('Use regular expression').click();
  await ui.find.fill('[Cc]ats?\\b');
  await expect(ui.count).toHaveText(/of 3$/);
  await ui.replace.fill('pet');
  await ui.replace.press('ControlOrMeta+Enter');
  await expect(ui.count).toHaveText('No results');
  await expect
    .poll(() => sourceText(window))
    .toBe('# Pets\n\nThe pet and the pet met a caterpillar.\n\nNo more pet here.\n');
});

test('the Find and Replace shortcut opens the find bar with the replace row', async ({
  launch,
  workspace,
}) => {
  const app = await openPets(launch, await workspace.write('pets.md', PETS));
  await pressShortcut(app, IS_MAC ? 'Cmd+Alt+F' : 'Ctrl+H');
  const ui = findBar(app.window);
  await expect(ui.find).toBeFocused();
  await expect(ui.replace).toBeVisible();
});
