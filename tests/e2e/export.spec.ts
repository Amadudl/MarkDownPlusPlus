import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { expect, pressShortcut, runCommand, test } from './fixtures';

const EXPORT_SOURCE = [
  '# Export Title',
  '',
  'Some **bold** text and a [safe link](https://example.com).',
  '',
  '<script>window.pwned = true;</script>',
  '',
  '<img src="x" onerror="window.pwned = true">',
  '',
  '[evil link](javascript:alert(1))',
  '',
  '![A red pixel](images/pixel.png)',
  '',
  '```js',
  'const answer = 42;',
  '```',
  '',
  '| A | B |',
  '|---|---|',
  '| 1 | 2 |',
  '',
].join('\n');

test.describe('Export', () => {
  test('writes a sanitised, self-contained HTML file', async ({ launch, workspace }) => {
    const source = await workspace.write('export.md', EXPORT_SOURCE);
    const app = await launch({ files: [source] });
    const target = workspace.path('export.html');
    await app.stubs.queueSave(target);
    await runCommand(app, 'Export as HTML…');

    await expect(app.window.getByRole('status').filter({ hasText: `Exported to ${target}` })).toBeVisible();
    const html = await readFile(target, 'utf8');
    const saves = await app.stubs.calls('save');
    expect(saves[0]?.detail).toMatch(/^Export as HTML\|.*export\.html$/);

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<title>export</title>');
    expect(html).toMatch(/<h1[^>]*>Export Title<\/h1>/);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com"/);
    expect(html).toMatch(/<table[\s>]/);
    expect(html).toContain('answer');
    // Sanitised: no script from the document, no event handlers, no javascript: URLs.
    expect(html).not.toContain('window.pwned');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<p>evil link</p>');
    expect(html).not.toMatch(/\sonerror=/i);
    expect(html).not.toMatch(/javascript:/i);
    // Self-contained: the local image is inlined, no references to local files remain.
    expect(html).toMatch(/<img[^>]*src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    expect(html).not.toMatch(/(?:src|href)="mpp-file:/);
    expect(html).not.toContain('images/pixel.png');
  });

  test('writes a PDF file', async ({ launch, workspace }) => {
    const source = await workspace.write('export.md', EXPORT_SOURCE);
    const app = await launch({ files: [source] });
    const target = workspace.path('export.pdf');
    await app.stubs.queueSave(target);
    await pressShortcut(app, 'CmdOrCtrl+Shift+E');

    await expect(app.window.getByRole('status').filter({ hasText: `Exported to ${target}` })).toBeVisible({
      timeout: 30_000,
    });
    const bytes = await readFile(target);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await stat(target)).size).toBeGreaterThan(1000);
    const saves = await app.stubs.calls('save');
    expect(saves[0]?.detail).toMatch(/^Export as PDF\|.*export\.pdf$/);
  });

  test('a cancelled export writes nothing', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('notes.md')] });
    await app.stubs.queueSave(null);
    await runCommand(app, 'Export as HTML…');
    await expect.poll(async () => (await app.stubs.calls('save')).length).toBe(1);
    expect(existsSync(workspace.path('notes.html'))).toBe(false);
    await expect(app.window.getByRole('status').filter({ hasText: 'Exported to' })).toHaveCount(0);
  });
});
