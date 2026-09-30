import type { Locator, Page } from '@playwright/test';
import type { DomElement, RendererGlobals } from './dom';
import { expect, sourceEditor, switchMode, test, visualEditor } from './fixtures';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const TABLE_MD = '# Table\n\n| Name | Value |\n| --- | --- |\n| r1 | a |\n| r2 | b |\n| r3 | c |\n';

/** Computed style values of an element. */
function computed(locator: Locator, properties: readonly string[]): Promise<Record<string, string>> {
  return locator.evaluate((element: DomElement, names) => {
    const style = (globalThis as unknown as RendererGlobals).getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, properties);
}

/** Background colours of the first cell of every body row of a table. */
function bodyRowBackgrounds(rows: Locator): Promise<string[]> {
  return rows.evaluateAll((elements: DomElement[]) =>
    elements.map((row) => {
      const cell = row.querySelector('td');
      if (cell === null) return 'no cell';
      return (globalThis as unknown as RendererGlobals)
        .getComputedStyle(cell)
        .getPropertyValue('background-color');
    }),
  );
}

async function openSettings(window: Page, section: string): Promise<Locator> {
  await window.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = window.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: section }).click();
  await expect(dialog.getByRole('tab', { name: section })).toHaveAttribute('aria-selected', 'true');
  return dialog;
}

test.describe('Themes and element styles', () => {
  test('striped tables keep their frame and stripe the same rows as the export', async ({
    launch,
    workspace,
  }) => {
    const path = await workspace.write('table.md', TABLE_MD);
    const app = await launch({ files: [path] });
    const { window } = app;
    await expect(window.locator('html')).toHaveAttribute('data-mpp-table', 'striped');
    const table = visualEditor(window).getByRole('table');
    await expect(table).toBeVisible();

    // A real border (painted outside the cells), not an inset shadow the cells cover.
    const frame = await computed(table, ['border-top-width', 'border-left-width', 'box-shadow']);
    expect(frame).toEqual({ 'border-top-width': '1px', 'border-left-width': '1px', 'box-shadow': 'none' });

    // Editor: the header row sits in the tbody (tr[data-is-header]); the 2nd body row is striped.
    const editorRows = await bodyRowBackgrounds(table.locator('tr:not([data-is-header])'));
    expect(editorRows).toHaveLength(3);
    expect(editorRows[0]).toBe(TRANSPARENT);
    expect(editorRows[1]).not.toBe(TRANSPARENT);
    expect(editorRows[2]).toBe(TRANSPARENT);

    // Export DOM shape (thead + tbody), as rendered by the settings live preview.
    const dialog = await openSettings(window, 'Markdown Elements');
    const sample = dialog.getByRole('region', { name: 'Live preview' }).locator('table');
    const exportRows = await bodyRowBackgrounds(sample.locator('tbody tr'));
    expect(exportRows).toEqual([TRANSPARENT, editorRows[1], TRANSPARENT]);
  });

  test('element style cards preview each preset with its own variants', async ({ mpp }) => {
    const { window } = mpp;
    const dialog = await openSettings(window, 'Markdown Elements');
    const presets = dialog.getByRole('region', { name: 'Presets' });
    const technical = presets.getByRole('button', { name: 'Technical', exact: true });
    const modern = presets.getByRole('button', { name: 'Modern', exact: true });
    // The miniature is hidden from assistive technology: names stay the preset names.
    await expect(technical).toHaveAccessibleName('Technical');
    // Grid (Technical) and striped (Modern, the active style) tables differ in the cards.
    await expect(technical.locator('table')).toHaveCSS('border-collapse', 'collapse');
    await expect(modern.locator('table')).toHaveCSS('border-collapse', 'separate');
    await expect(technical.locator('figure.mpp-code-block')).toBeVisible();
    await expect(technical.locator('h2')).toHaveText('Heading');
    await expect(window.locator('html')).toHaveAttribute('data-mpp-element-style', 'modern');
  });

  test('Markdown mode colours list markers, not the text of list items', async ({ launch, workspace }) => {
    const path = await workspace.write('list.md', 'Intro text\n\n- first item\n- second item\n');
    const app = await launch({ files: [path] });
    const { window } = app;
    await switchMode(window, 'Markdown');
    const editor = sourceEditor(window);
    const line = editor.locator('.cm-line', { hasText: 'first item' });
    await expect(line).toBeVisible();
    await expect(line.locator('span', { hasText: 'first item' })).toHaveCount(0);
    const marker = line.locator('span', { hasText: /^-$/ });
    await expect(marker).toHaveCount(1);
    const intro = editor.locator('.cm-line', { hasText: 'Intro text' });
    const [listColor, introColor] = await Promise.all([
      computed(line, ['color']),
      computed(intro, ['color']),
    ]);
    expect(listColor).toEqual(introColor);
  });

  test('status bar items expose their names without the tooltip text', async ({ launch, workspace }) => {
    const path = await workspace.write('stats.md', 'one two three\n');
    const app = await launch({ files: [path] });
    const { window } = app;
    const status = window.getByRole('contentinfo', { name: 'Status bar' });
    const mode = status.getByRole('button', { name: 'Visual', exact: true });
    await expect(mode).toBeVisible();
    await expect(mode).toHaveAccessibleDescription('Toggle Visual / Markdown');
    const snapshot = await status.ariaSnapshot();
    expect(snapshot).not.toContain('Toggle Visual');
    expect(snapshot).not.toContain('without spaces');
    expect(snapshot).not.toContain('Switch line endings');
    const toolbar = await window.getByRole('radiogroup', { name: 'Editor mode' }).ariaSnapshot();
    expect(toolbar).not.toContain('Switch between Visual and Markdown');
  });

  test('picking a scheme for the other appearance explains itself and can be used now', async ({ mpp }) => {
    const { window } = mpp;
    const html = window.locator('html');
    await window.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-mpp-theme-kind', 'light');
    const before = await html.getAttribute('data-mpp-ui-theme');
    const dialog = await openSettings(window, 'Appearance');
    const galleries = dialog.getByRole('region', { name: /schemes$/ });
    await expect(galleries.first()).toHaveAccessibleName('Light schemes');

    const dark = dialog.getByRole('region', { name: 'Dark schemes' });
    await dark.getByRole('button', { name: /^Dracula \(dark\)/ }).click();
    await expect(dark.getByRole('button', { name: /^Dracula \(dark\), Used in dark mode/ })).toBeVisible();
    await expect(dark.getByRole('status')).toHaveText(
      /Dracula will be used when your system is in dark mode\./,
    );
    await expect(html).toHaveAttribute('data-mpp-ui-theme', before ?? '');

    await dark.getByRole('button', { name: 'Use it now' }).click();
    await expect(html).toHaveAttribute('data-mpp-ui-theme', 'dracula');
    await expect(dialog.getByRole('switch', { name: 'Follow system appearance' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(dialog.getByRole('status')).toHaveCount(0);
  });
});
