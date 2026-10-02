import type { Page } from '@playwright/test';
import type { DomElement } from './dom';
import { expect, pressShortcut, test } from './fixtures';

/** A CSS custom property set on `<html>` by the theme engine. */
function rootVariable(window: Page, name: string): Promise<string> {
  return window
    .locator('html')
    .evaluate((element: DomElement, variable) => element.style.getPropertyValue(variable).trim(), name);
}

async function openSettings(window: Page, section: string) {
  await window.getByRole('button', { name: 'Settings' }).click();
  const dialog = window.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: section }).click();
  await expect(dialog.getByRole('tab', { name: section })).toHaveAttribute('aria-selected', 'true');
  return dialog;
}

/** Fixed (not OS-dependent) appearance so colours are deterministic. */
const FIXED_MIDNIGHT = { appearance: { followSystem: false, uiTheme: 'midnight' } };

test.describe('Settings and themes', () => {
  test('switching the UI theme updates the CSS variables on the document root', async ({ mpp }) => {
    const { window } = mpp;
    const html = window.locator('html');
    const dialog = await openSettings(window, 'Appearance');
    const follow = dialog.getByRole('switch', { name: 'Follow system appearance' });
    await expect(follow).toHaveAttribute('aria-checked', 'true');
    await follow.click();
    await expect(follow).toHaveAttribute('aria-checked', 'false');

    await dialog.getByLabel('Colour scheme').selectOption({ label: 'Dracula' });
    await expect(html).toHaveAttribute('data-mpp-ui-theme', 'dracula');
    await expect(html).toHaveAttribute('data-mpp-theme-kind', 'dark');
    await expect.poll(() => rootVariable(window, '--mpp-ui-background')).toBe('#21222c');
    await expect(html).toHaveCSS('color-scheme', 'dark');

    const paper = dialog.getByRole('button', { name: /^Paper \(light\)/ });
    await paper.click();
    await expect(paper).toHaveAttribute('aria-pressed', 'true');
    await expect(html).toHaveAttribute('data-mpp-ui-theme', 'paper');
    await expect(html).toHaveAttribute('data-mpp-theme-kind', 'light');
    await expect.poll(() => rootVariable(window, '--mpp-ui-background')).toBe('#f4f1ea');
    await expect(window.locator('body')).toHaveCSS('background-color', 'rgb(244, 241, 234)');
  });

  test('selecting a code theme updates the code variables', async ({ launch }) => {
    const app = await launch({ settings: FIXED_MIDNIGHT });
    const { window } = app;
    const html = window.locator('html');
    const dialog = await openSettings(window, 'Code Blocks');
    await expect(dialog.getByRole('button', { name: 'Auto (match UI theme)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const monokai = dialog.getByRole('button', { name: 'Monokai (dark)', exact: true });
    await monokai.click();
    await expect(monokai).toHaveAttribute('aria-pressed', 'true');
    await expect(html).toHaveAttribute('data-mpp-code-theme', 'monokai');
    await expect.poll(() => rootVariable(window, '--mpp-code-keyword')).toBe('#f92672');
    await expect(dialog).toContainText('In use: Monokai');
  });

  test('selecting an element style sets the variant data attributes', async ({ launch }) => {
    const app = await launch({ settings: FIXED_MIDNIGHT });
    const { window } = app;
    const html = window.locator('html');
    await expect(html).toHaveAttribute('data-mpp-element-style', 'modern');
    await expect(html).toHaveAttribute('data-mpp-quote', 'card');
    const dialog = await openSettings(window, 'Markdown Elements');
    await dialog.getByRole('button', { name: 'Academic', exact: true }).click();
    await expect(html).toHaveAttribute('data-mpp-element-style', 'academic');
    await expect(html).toHaveAttribute('data-mpp-quote', 'minimal');
    await expect(html).toHaveAttribute('data-mpp-quote-italic', 'true');
    await expect(html).toHaveAttribute('data-mpp-codeblock', 'bordered');
    await expect(html).toHaveAttribute('data-mpp-code-line-numbers', 'true');
    await expect(html).toHaveAttribute('data-mpp-link', 'underline');
    await expect(dialog.getByRole('heading', { name: 'Live preview — Academic' })).toBeVisible();
  });

  test('a duplicated custom theme can be edited colour by colour', async ({ launch }) => {
    const app = await launch({ settings: FIXED_MIDNIGHT });
    const { window } = app;
    const html = window.locator('html');
    const dialog = await openSettings(window, 'Appearance');
    await expect(dialog.getByText('Built-in schemes are read-only.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Duplicate' }).click();

    await expect(
      dialog.getByRole('button', { name: /^Midnight Copy \(dark\), Custom, Active/ }),
    ).toBeVisible();
    // The theme is applied to the document one render after the gallery updates: wait for it.
    await expect(html).toHaveAttribute('data-mpp-ui-theme', /^custom-/);
    const background = dialog.getByLabel('Background', { exact: true });
    await expect(background).toHaveValue('#0e1016');
    await background.fill('#123456');
    await expect.poll(() => rootVariable(window, '--mpp-ui-background')).toBe('#123456');

    const name = dialog.getByRole('textbox', { name: 'Theme name' });
    await name.fill('My Theme');
    await name.press('Enter');
    await expect(dialog.getByRole('heading', { name: 'Customize “My Theme”' })).toBeVisible();
  });

  test('settings persist across a relaunch', async ({ launch }) => {
    const first = await launch({ settings: FIXED_MIDNIGHT });
    let dialog = await openSettings(first.window, 'Appearance');
    await dialog.getByRole('button', { name: 'Duplicate' }).click();
    await dialog.getByLabel('Accent', { exact: true }).fill('#ff00aa');
    await expect.poll(() => rootVariable(first.window, '--mpp-ui-accent')).toBe('#ff00aa');
    await dialog.getByRole('tab', { name: 'Code Blocks' }).click();
    await dialog.getByRole('button', { name: 'Dracula (dark)', exact: true }).click();
    await dialog.getByRole('tab', { name: 'Markdown Elements' }).click();
    await dialog.getByRole('button', { name: 'Typewriter', exact: true }).click();
    await dialog.getByRole('tab', { name: 'Editor' }).click();
    await dialog.getByRole('switch', { name: 'Line numbers' }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    const customId = await first.window.locator('html').getAttribute('data-mpp-ui-theme');
    await first.close();

    const second = await launch();
    const html = second.window.locator('html');
    await expect(html).toHaveAttribute('data-mpp-ui-theme', customId ?? '');
    await expect(html).toHaveAttribute('data-mpp-code-theme', 'dracula');
    await expect(html).toHaveAttribute('data-mpp-element-style', 'typewriter');
    await expect.poll(() => rootVariable(second.window, '--mpp-ui-accent')).toBe('#ff00aa');
    dialog = await openSettings(second.window, 'Editor');
    await expect(dialog.getByRole('switch', { name: 'Line numbers' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await dialog.getByRole('tab', { name: 'Appearance' }).click();
    await expect(
      dialog.getByRole('button', { name: /^Midnight Copy \(dark\), Custom, Active/ }),
    ).toBeVisible();
  });

  test('zoom shortcuts change and reset the zoom level', async ({ mpp }) => {
    const { window } = mpp;
    const status = window.getByRole('contentinfo', { name: 'Status bar' });
    await expect(status.getByRole('button', { name: 'Zoom 100%. Click to reset.' })).toBeVisible();
    await pressShortcut(mpp, 'CmdOrCtrl+=');
    await expect(status.getByRole('button', { name: 'Zoom 110%. Click to reset.' })).toBeVisible();
    await expect.poll(() => rootVariable(window, '--mpp-zoom')).toBe('1.1');
    await pressShortcut(mpp, 'CmdOrCtrl+-');
    await pressShortcut(mpp, 'CmdOrCtrl+-');
    await expect(status.getByRole('button', { name: 'Zoom 90%. Click to reset.' })).toBeVisible();
    await status.getByRole('button', { name: 'Zoom 90%. Click to reset.' }).click();
    await expect(status.getByRole('button', { name: 'Zoom 100%. Click to reset.' })).toBeVisible();
  });

  test('the settings shortcut opens the dialog and Escape closes it', async ({ mpp }) => {
    const { window } = mpp;
    await pressShortcut(mpp, 'CmdOrCtrl+,');
    const dialog = window.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Appearance' })).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('tab', { name: 'Code Blocks' })).toHaveAttribute('aria-selected', 'true');
    await window.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
