import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import {
  activePanel,
  APP_DIR,
  expect,
  openViaDialog,
  pressShortcut,
  runCommand,
  saveState,
  tab,
  tabs,
  test,
  visualEditor,
  type LaunchedApp,
} from './fixtures';

/** Path of the Electron binary (the `electron` package exports it). */
const ELECTRON_BINARY = createRequire(import.meta.url)('electron') as string;

/** Places the caret at the end of the paragraph containing `text` and types `addition`. */
async function appendToParagraph(window: Page, text: string, addition: string): Promise<void> {
  await visualEditor(window).getByText(text).click();
  await window.keyboard.press('End');
  await window.keyboard.type(addition, { delay: 20 });
}

async function expectDirty(window: Page, title: string): Promise<void> {
  await expect(tab(window, title)).toHaveClass(/is-dirty/);
  await expect(tab(window, title)).toContainText('(unsaved changes)');
  await expect(saveState(window)).toHaveText(/Unsaved/);
  await expect(window).toHaveTitle(`● ${title} — MarkDown++`);
}

async function expectClean(window: Page, title: string): Promise<void> {
  await expect(tab(window, title)).not.toHaveClass(/is-dirty/);
  await expect(saveState(window)).toHaveText(/Saved/);
  await expect(window).toHaveTitle(`${title} — MarkDown++`);
}

/** Closes the active tab through its close button. */
async function closeTab(app: LaunchedApp, title: string): Promise<void> {
  await app.window.getByRole('button', { name: `Close ${title}` }).click();
}

test.describe('Documents', () => {
  test('opens files passed on the command line', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md'), workspace.path('second.md')] });
    const { window } = app;
    await expect(tabs(window)).toHaveCount(2);
    await expect(tabs(window).nth(0)).toContainText('notes.md');
    await expect(tabs(window).nth(1)).toContainText('second.md');
    await expect(tab(window, 'second.md')).toHaveAttribute('aria-selected', 'true');
    await expect(visualEditor(window).getByRole('heading', { name: 'Second' })).toBeVisible();
    await expectClean(window, 'second.md');
    await expect(tab(window, 'notes.md')).toHaveAttribute('title', workspace.path('notes.md'));
  });

  test('resolves relative command-line paths and ignores flags and missing files', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({
      files: ['--some-flag', 'notes.md', 'does-not-exist.md', workspace.path('notes.md')],
    });
    await expect(tabs(app.window)).toHaveCount(1);
    await expect(tab(app.window, 'notes.md')).toHaveAttribute('title', workspace.path('notes.md'));
  });

  test('a second instance hands its files to the running window and exits', async ({
    launch,
    workspace,
    userDataDir,
  }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    const second = spawn(ELECTRON_BINARY, [APP_DIR, workspace.path('second.md')], {
      cwd: workspace.dir,
      env: { ...process.env, MPP_USER_DATA_DIR: userDataDir, NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        second.once('error', reject);
        second.once('exit', (code) => resolve(code));
      });
      expect(exitCode).toBe(0);
      await expect(tabs(app.window)).toHaveCount(2);
      await expect(tab(app.window, 'second.md')).toHaveAttribute('aria-selected', 'true');
      expect(
        await app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      ).toBe(1);
    } finally {
      if (second.exitCode === null && second.signalCode === null) second.kill('SIGKILL');
    }
  });

  test('opens files through the Open dialog and does not duplicate open files', async ({
    mpp,
    workspace,
  }) => {
    const { window } = mpp;
    await openViaDialog(mpp, [workspace.path('notes.md')]);
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
    await expect(visualEditor(window).getByText('Hello')).toBeVisible();

    await openViaDialog(mpp, [workspace.path('second.md')]);
    await expect(tabs(window)).toHaveCount(2);
    await openViaDialog(mpp, [workspace.path('notes.md')]);
    await expect(tabs(window)).toHaveCount(2);
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
  });

  test('marks edited documents dirty and saves them with the shortcut', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    await expectClean(window, 'second.md');

    await appendToParagraph(window, 'Another document.', ' More text.');
    await expectDirty(window, 'second.md');

    await pressShortcut(app, 'CmdOrCtrl+S');
    await expectClean(window, 'second.md');
    const saved = await workspace.read('second.md');
    expect(saved).toBe('# Second\n\nAnother document. More text.\n');
  });

  test('saves an untitled document through the Save dialog', async ({ mpp, workspace }) => {
    const { window } = mpp;
    await window.getByRole('button', { name: 'New document' }).first().click();
    await visualEditor(window).click();
    await window.keyboard.type('Fresh words', { delay: 20 });
    await expectDirty(window, 'Untitled-1');

    const target = workspace.path('fresh.md');
    await mpp.stubs.queueSave(target);
    await pressShortcut(mpp, 'CmdOrCtrl+S');
    await expect(tab(window, 'fresh.md')).toBeVisible();
    await expectClean(window, 'fresh.md');
    // New documents use the platform line ending (setting `editor.newLineEnding: 'system'`).
    expect(await workspace.read('fresh.md')).toBe(
      `Fresh words${process.platform === 'win32' ? '\r\n' : '\n'}`,
    );
    const saves = await mpp.stubs.calls('save');
    expect(saves).toHaveLength(1);
    expect(saves[0]?.detail).toMatch(/^Save Markdown File\|.*Untitled-1\.md$/);
  });

  test('Save As writes a copy and switches the tab to it', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    await appendToParagraph(window, 'Another document.', ' Changed.');
    const copy = workspace.path('copy.md');
    await app.stubs.queueSave(copy);
    await pressShortcut(app, 'CmdOrCtrl+Shift+S');
    await expect(tab(window, 'copy.md')).toHaveAttribute('aria-selected', 'true');
    await expectClean(window, 'copy.md');
    await expect(tabs(window)).toHaveCount(1);
    expect(await workspace.read('copy.md')).toBe('# Second\n\nAnother document. Changed.\n');
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document.\n');
  });

  test('a cancelled Save As keeps the document dirty', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    const { window } = app;
    await appendToParagraph(window, 'Another document.', '!');
    await app.stubs.queueSave(null);
    await runCommand(app, 'Save As…');
    await expect.poll(async () => (await app.stubs.calls('save')).length).toBe(1);
    await expectDirty(window, 'second.md');
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document.\n');
  });

  test('closing a clean tab does not ask anything', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md'), workspace.path('second.md')] });
    await closeTab(app, 'second.md');
    await expect(tabs(app.window)).toHaveCount(1);
    await expect(tab(app.window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
    expect(await app.stubs.calls('messageBox')).toEqual([]);
  });

  test('closing a dirty tab and choosing "Save" writes the file', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    await appendToParagraph(app.window, 'Another document.', ' Saved on close.');
    await expectDirty(app.window, 'second.md');
    await app.stubs.queueMessageBox(0);
    await closeTab(app, 'second.md');
    await expect(tabs(app.window)).toHaveCount(0);
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document. Saved on close.\n');
    const prompts = await app.stubs.calls('messageBox');
    expect(prompts.map((call) => call.detail)).toEqual([
      'Do you want to save the changes you made to "second.md"?',
    ]);
  });

  test('closing a dirty tab and choosing "Don\'t Save" discards the changes', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    await appendToParagraph(app.window, 'Another document.', ' Throw away.');
    await app.stubs.queueMessageBox(1);
    await closeTab(app, 'second.md');
    await expect(tabs(app.window)).toHaveCount(0);
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document.\n');
  });

  test('closing a dirty tab and choosing "Cancel" keeps it open and dirty', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    await appendToParagraph(app.window, 'Another document.', ' Keep me.');
    await app.stubs.queueMessageBox(2);
    await closeTab(app, 'second.md');
    await expect.poll(async () => (await app.stubs.calls('messageBox')).length).toBe(1);
    await expect(tabs(app.window)).toHaveCount(1);
    await expectDirty(app.window, 'second.md');
    await expect(visualEditor(app.window)).toContainText('Keep me.');
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document.\n');
  });

  test('closing the window with unsaved changes asks first and can be cancelled', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({ files: [workspace.path('second.md')] });
    await appendToParagraph(app.window, 'Another document.', ' Pending.');
    await app.stubs.queueMessageBox(2);
    await app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await expect.poll(async () => (await app.stubs.calls('messageBox')).length).toBe(1);
    await expect(tab(app.window, 'second.md')).toBeVisible();
    expect(await app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
      1,
    );

    // Second attempt: save and let the window close.
    await app.stubs.queueMessageBox(0);
    const closed = app.window.waitForEvent('close');
    await app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await closed;
    expect(await workspace.read('second.md')).toBe('# Second\n\nAnother document. Pending.\n');
  });

  test('switches tabs by click, keyboard and shortcut', async ({ launch, workspace }) => {
    const app = await launch({
      files: [workspace.path('notes.md'), workspace.path('second.md'), workspace.path('third.md')],
    });
    const { window } = app;
    const heading = (name: string) => visualEditor(window).getByRole('heading', { name });
    await expect(tab(window, 'third.md')).toHaveAttribute('aria-selected', 'true');

    await tab(window, 'notes.md').click();
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
    await expect(heading('Notes')).toBeVisible();
    await expect(activePanel(window)).toHaveCount(1);

    await tab(window, 'notes.md').press('ArrowRight');
    await expect(tab(window, 'second.md')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(window, 'second.md')).toBeFocused();
    await expect(heading('Second')).toBeVisible();
    await tab(window, 'second.md').press('End');
    await expect(tab(window, 'third.md')).toHaveAttribute('aria-selected', 'true');
    await tab(window, 'third.md').press('Home');
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');

    await pressShortcut(app, 'Ctrl+Tab');
    await expect(tab(window, 'second.md')).toHaveAttribute('aria-selected', 'true');
    await pressShortcut(app, 'Ctrl+Shift+Tab');
    await expect(tab(window, 'notes.md')).toHaveAttribute('aria-selected', 'true');
    await pressShortcut(app, 'Ctrl+Shift+Tab');
    await expect(tab(window, 'third.md')).toHaveAttribute('aria-selected', 'true');
  });

  test('keeps unsaved edits of inactive tabs', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md'), workspace.path('second.md')] });
    const { window } = app;
    await appendToParagraph(window, 'Another document.', ' Draft.');
    await tab(window, 'notes.md').click();
    await expect(tab(window, 'second.md')).toHaveClass(/is-dirty/);
    await expect(tab(window, 'notes.md')).not.toHaveClass(/is-dirty/);
    await tab(window, 'second.md').click();
    await expect(visualEditor(window)).toContainText('Another document. Draft.');
  });

  test('reorders tabs by drag and drop', async ({ launch, workspace }) => {
    const app = await launch({
      files: [workspace.path('notes.md'), workspace.path('second.md'), workspace.path('third.md')],
    });
    const { window } = app;
    await tab(window, 'third.md').dragTo(tab(window, 'notes.md'));
    await expect(tabs(window).nth(0)).toContainText('third.md');
    await expect(tabs(window).nth(1)).toContainText('notes.md');
    await expect(tabs(window).nth(2)).toContainText('second.md');
  });

  test('preserves CRLF line endings and the BOM on save', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('windows.md')] });
    const { window } = app;
    const status = window.getByRole('contentinfo', { name: 'Status bar' });
    await expect(status.getByRole('button', { name: /Line endings: CRLF/ })).toBeVisible();
    await expect(status).toContainText('UTF-8 BOM');

    // "Line one" and "Line two" form one paragraph with a soft line break.
    await appendToParagraph(window, 'Line two', ' edited');
    await pressShortcut(app, 'CmdOrCtrl+S');
    await expect(saveState(window)).toHaveText(/Saved/);

    const bytes = await workspace.readBytes('windows.md');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.subarray(3).toString('utf8');
    expect(text).toBe('# Windows file\r\n\r\nLine one\r\nLine two edited\r\n');
  });

  test('unedited CRLF + BOM files are written back byte-identical', async ({ launch, workspace }) => {
    const original = await workspace.readBytes('windows.md');
    const before = (await stat(workspace.path('windows.md'))).mtimeMs;
    const app = await launch({ files: [workspace.path('windows.md')] });
    await expect(saveState(app.window)).toHaveText(/Saved/);
    await runCommand(app, 'Save');
    await expect.poll(async () => (await stat(workspace.path('windows.md'))).mtimeMs).toBeGreaterThan(before);
    expect((await workspace.readBytes('windows.md')).equals(original)).toBe(true);
  });

  test('switching the line ending in the status bar converts the file on save', async ({
    launch,
    workspace,
  }) => {
    const app = await launch({ files: [workspace.path('windows.md')] });
    const { window } = app;
    const status = window.getByRole('contentinfo', { name: 'Status bar' });
    await status.getByRole('button', { name: /Line endings: CRLF/ }).click();
    await expect(status.getByRole('button', { name: /Line endings: LF/ })).toBeVisible();
    await expectDirty(window, 'windows.md');
    await pressShortcut(app, 'CmdOrCtrl+S');
    await expectClean(window, 'windows.md');
    const bytes = await workspace.readBytes('windows.md');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString('utf8')).toBe('# Windows file\n\nLine one\nLine two\n');
  });
});
