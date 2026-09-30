import type { Page } from '@playwright/test';
import type { DomElement, RendererGlobals } from './dom';
import {
  activePanel,
  expect,
  pressShortcut,
  saveState,
  sourceEditor,
  sourceText,
  switchMode,
  tab,
  test,
  visualEditor,
  type LaunchedApp,
  type Workspace,
} from './fixtures';

/**
 * End-to-end checks of editor behaviour: list typing right after Enter, YAML
 * front matter, focus handling, the find bar, the source column width, table
 * column separators, dirty tracking, remote images and bounded inline math.
 */

async function newVisualDocument(app: LaunchedApp): Promise<Page> {
  const { window } = app;
  await window.getByRole('button', { name: 'New document' }).first().click();
  await visualEditor(window).click();
  await expect(visualEditor(window)).toBeFocused();
  return window;
}

async function markdownOf(window: Page): Promise<string> {
  await switchMode(window, 'Markdown');
  const text = await sourceText(window);
  await switchMode(window, 'Visual');
  return text;
}

function findBar(window: Page) {
  const bar = window.getByRole('search', { name: 'Find and replace' });
  return {
    bar,
    find: bar.getByRole('textbox', { name: 'Find', exact: true }),
    count: bar.locator('.findbar-count'),
    regexp: bar.getByRole('button', { name: 'Use regular expression' }),
  };
}

/** Writes a file until `check` passes: the watcher attaches asynchronously after a document opens. */
async function changeOnDisk(workspace: Workspace, name: string, content: string, check: () => Promise<void>) {
  await expect(async () => {
    await workspace.write(name, content);
    await check();
  }).toPass({ timeout: 15_000, intervals: [250, 500, 1000] });
}

const activeTag = (window: Page): Promise<string> =>
  window.evaluate(() => {
    const { document } = globalThis as unknown as RendererGlobals;
    const active = document.activeElement;
    return active === null ? 'none' : `${active.tagName}:${active.getAttribute('aria-label') ?? ''}`;
  });

test.describe('Visual mode lists', () => {
  for (const [prefix, expected] of [
    ['- ', '- one\n- second\n'],
    ['1. ', '1. one\n2. second\n'],
    ['- [ ] ', '- [ ] one\n- [ ] second\n'],
  ] as const) {
    test(`keys typed right after Enter stay in order (${prefix.trim()})`, async ({ mpp }) => {
      // The race needs the next key within a few ms of Enter; several rounds make a regression visible.
      for (let round = 0; round < 3; round += 1) {
        const window = await newVisualDocument(mpp);
        await window.keyboard.type(`${prefix}one`, { delay: 25 });
        await window.waitForTimeout(100);
        await window.keyboard.press('Enter');
        await window.keyboard.type('second', { delay: 40 });
        await window.waitForTimeout(50);
        expect(await markdownOf(window)).toBe(expected);
      }
    });
  }
});

test.describe('YAML front matter', () => {
  test('survives an edit in Visual mode verbatim and is shown read-only', async ({ launch, workspace }) => {
    const front = '---\ntitle: Hello\ntags: [a, b]\n---\n\n';
    const path = await workspace.write('front.md', `${front}# Body\n\nText\n`);
    const app = await launch({ files: [path] });
    const { window } = app;
    const panel = activePanel(window).getByRole('region', { name: 'Front matter (read-only)' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('title: Hello');
    const editor = visualEditor(window);
    await expect(editor.getByRole('heading', { level: 1, name: 'Body' })).toBeVisible();
    await expect(editor.locator('hr')).toHaveCount(0);
    await editor.getByText('Text').click();
    await window.keyboard.press('End');
    await window.keyboard.type('!', { delay: 20 });
    await pressShortcut(app, 'CmdOrCtrl+S');
    await expect(saveState(window)).toHaveText(/Saved/);
    expect(await workspace.read('front.md')).toBe(`${front}# Body\n\nText!\n`);
  });
});

test.describe('Focus', () => {
  test('follows the mode switch shortcut', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    await visualEditor(window).getByText('this is a note').click();
    await expect(visualEditor(window)).toBeFocused();
    await pressShortcut(app, 'CmdOrCtrl+E');
    await expect(sourceEditor(window)).toBeFocused();
    await window.keyboard.type('ZZZ', { delay: 20 });
    expect(await sourceText(window)).toContain('ZZZ');
    await pressShortcut(app, 'CmdOrCtrl+E');
    await expect(visualEditor(window)).toBeFocused();
  });

  test('stays in the editor when a clean file is reloaded from disk', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const { window } = app;
    const editor = visualEditor(window);
    await editor.getByText('this is a note').click();
    await expect(editor).toBeFocused();
    await changeOnDisk(workspace, 'notes.md', '# Changed outside\n\nNew body.\n', async () => {
      await expect(editor.getByRole('heading', { name: 'Changed outside' })).toBeVisible({ timeout: 2000 });
    });
    await expect(editor).toBeFocused();
    expect(await activeTag(window)).toBe('DIV:Document editor');
  });
});

test.describe('Find bar', () => {
  test('highlights matches and keeps the count current while editing', async ({ launch, workspace }) => {
    const path = await workspace.write('find.md', '# Find\n\ncat dog cat\n');
    const app = await launch({ files: [path] });
    const { window } = app;
    await pressShortcut(app, 'CmdOrCtrl+F');
    const ui = findBar(window);
    await ui.find.fill('cat');
    await expect(ui.count).toHaveText('1 of 2');
    const editor = visualEditor(window);
    await expect(editor.locator('.mpp-search-match')).toHaveCount(2);
    const background = await editor
      .locator('.mpp-search-match:not(.mpp-search-current)')
      .first()
      .evaluate((element: DomElement) => {
        const { getComputedStyle } = globalThis as unknown as RendererGlobals;
        return getComputedStyle(element).getPropertyValue('background-color');
      });
    expect(background).not.toBe('rgba(0, 0, 0, 0)');

    await editor.getByText('dog').click();
    await window.keyboard.press('End');
    await window.keyboard.type(' cat', { delay: 20 });
    await expect(ui.count).toHaveText(/of 3$/);
  });

  test('closing it removes the highlights of every tab', async ({ launch, workspace }) => {
    const first = await workspace.write('first.md', '# First\n\nword word word\n');
    const second = await workspace.write('second-doc.md', '# Second\n\nword\n');
    const app = await launch({ files: [first, second] });
    const { window } = app;
    await tab(window, 'first.md').click();
    await pressShortcut(app, 'CmdOrCtrl+F');
    await findBar(window).find.fill('word');
    await expect(findBar(window).count).toHaveText('1 of 3');
    await tab(window, 'second-doc.md').click();
    await expect(findBar(window).count).toHaveText('1 of 1');
    await expect(window.locator('.mpp-search-match')).toHaveCount(1);
    await findBar(window).find.press('Escape');
    await expect(window.locator('.mpp-search-match')).toHaveCount(0);
    await tab(window, 'first.md').click();
    await expect(window.locator('.mpp-search-match')).toHaveCount(0);
  });

  test('refuses catastrophic regular expressions instead of freezing', async ({ launch, workspace }) => {
    const path = await workspace.write('regex.md', `# Regex\n\n${'a'.repeat(40)}b\n`);
    const app = await launch({ files: [path] });
    const { window } = app;
    await pressShortcut(app, 'CmdOrCtrl+F');
    const ui = findBar(window);
    await ui.regexp.click();
    await ui.find.fill('(a+)+$');
    await expect(ui.count).toContainText('Nested repetition');
    await expect(ui.find).toHaveAttribute('aria-invalid', 'true');
    await ui.find.fill('a+b');
    await expect(ui.count).toHaveText('1 of 1');
  });
});

test.describe('Layout', () => {
  test('Markdown mode wraps lines at the Visual mode column width', async ({ launch, workspace }) => {
    const path = await workspace.write('wide.md', `# Wide\n\n${'word '.repeat(200)}\n`);
    const app = await launch({ files: [path] });
    const { window } = app;
    await window.setViewportSize({ width: 1400, height: 900 });
    await switchMode(window, 'Markdown');
    const widths = await sourceEditor(window).evaluate((element: DomElement) => {
      const { getComputedStyle, document } = globalThis as unknown as RendererGlobals;
      const root = getComputedStyle(document.documentElement).getPropertyValue('--mpp-el-content-width');
      const box = (
        element as unknown as { getBoundingClientRect(): { width: number } }
      ).getBoundingClientRect();
      return { content: box.width, column: Number.parseFloat(root) };
    });
    expect(widths.content).toBeLessThanOrEqual(widths.column + 32 + 1);
  });

  test('new tables show column separators while editing', async ({ mpp }) => {
    const window = await newVisualDocument(mpp);
    await window.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Table' }).click();
    const cell = visualEditor(window).locator('tr').first().locator('th, td').nth(1);
    await expect(cell).toBeVisible();
    const border = await cell.evaluate((element: DomElement) => {
      const { getComputedStyle } = globalThis as unknown as RendererGlobals;
      return getComputedStyle(element).getPropertyValue('border-inline-start-width');
    });
    expect(border).toBe('1px');
  });
});

test.describe('Dirty tracking', () => {
  test('an edit undone by hand does not mark a non-canonical file dirty', async ({ launch, workspace }) => {
    const path = await workspace.write('stars.md', '* one\n* two\n');
    const app = await launch({ files: [path] });
    const { window } = app;
    const editor = visualEditor(window);
    await editor.getByText('one').click();
    await window.keyboard.press('End');
    await window.keyboard.type('x', { delay: 20 });
    await expect(tab(window, 'stars.md')).toHaveClass(/is-dirty/);
    await window.keyboard.press('Backspace');
    await expect(tab(window, 'stars.md')).not.toHaveClass(/is-dirty/);
    await expect(saveState(window)).toHaveText(/Saved/);
  });
});

test.describe('Rendering', () => {
  test('remote images are blocked by default', async ({ launch, workspace }) => {
    const path = await workspace.write(
      'remote.md',
      '# Remote\n\n![Remote](https://example.invalid/image.png)\n',
    );
    const app = await launch({ files: [path] });
    const image = visualEditor(app.window).locator('img').first();
    await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/);
  });

  test('the main process cancels remote image requests while they are disabled', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({
      files: [workspace.path('notes.md')],
      allowConsole: [/net::ERR_BLOCKED_BY_CLIENT/],
    });
    const messages: string[] = [];
    app.window.on('console', (message) => messages.push(message.text()));
    const outcome = await app.window.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const { document } = globalThis as unknown as RendererGlobals;
          const img = (
            document as unknown as { createElement(tag: string): DomElement & Record<string, unknown> }
          ).createElement('img');
          img.onerror = () => resolve('error');
          img.onload = () => resolve('load');
          img.src = 'https://example.invalid/pixel.gif';
          (document.body as unknown as { append(node: unknown): void }).append(img);
        }),
    );
    expect(outcome).toBe('error');
    // Cancelled in the main process (not a DNS failure of the never-resolving host).
    await expect.poll(() => messages.some((text) => text.includes('net::ERR_BLOCKED_BY_CLIENT'))).toBe(true);
  });

  test('inline math is bounded like display math', async ({ launch, workspace }) => {
    const path = await workspace.write('math.md', '# Math\n\nBig $\\rule{99999em}{99999em}$ box\n');
    const app = await launch({ files: [path] });
    const rule = visualEditor(app.window).locator('span[data-type="math_inline"] .katex-rule');
    await expect(rule).toHaveCount(1);
    const style = await rule.getAttribute('style');
    expect(style).toContain('50em');
    expect(style).not.toContain('99999em');
  });
});
