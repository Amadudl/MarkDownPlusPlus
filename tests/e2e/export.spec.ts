import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { expect, pressShortcut, runCommand, test, type LaunchedApp } from './fixtures';

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

/** Page width of an image export with the default "Modern" element style (780 px column + 112 px padding). */
const DEFAULT_IMAGE_WIDTH = 780 + 112;

interface PngInfo {
  readonly width: number;
  readonly height: number;
  /** Distinct colours in a band at the top and at the bottom of the image. */
  readonly topColours: number;
  readonly bottomColours: number;
}

/** Decodes a PNG with Electron's nativeImage in the main process and samples it. */
function inspectPng(app: LaunchedApp, path: string): Promise<PngInfo> {
  return app.electronApp.evaluate(({ nativeImage }, file) => {
    const image = nativeImage.createFromPath(file);
    const { width, height } = image.getSize();
    const colours = (y: number): number => {
      const band = image.crop({ x: 0, y, width, height: 200 }).toBitmap();
      const seen = new Set<number>();
      for (let i = 0; i < band.length; i += 4) seen.add(band.readUInt32LE(i));
      return seen.size;
    };
    return { width, height, topColours: colours(0), bottomColours: colours(height - 400) };
  }, path);
}

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

  test('writes a sharp PNG image of the whole document', async ({ launch, workspace }) => {
    const source = await workspace.write('export.md', EXPORT_SOURCE);
    const app = await launch({ files: [source] });
    const target = workspace.path('export.png');
    await app.stubs.queueSave(target);
    await runCommand(app, 'Export as Image (PNG)…');

    await expect(app.window.getByRole('status').filter({ hasText: `Exported to ${target}` })).toBeVisible({
      timeout: 30_000,
    });
    const bytes = await readFile(target);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const saves = await app.stubs.calls('save');
    expect(saves[0]?.detail).toMatch(/^Export as Image\|.*export\.png$/);
    const png = await inspectPng(app, target);
    // Rendered at 2× the page width of the HTML/PDF export, with real content in it.
    expect(png.width).toBe(DEFAULT_IMAGE_WIDTH * 2);
    expect(png.height).toBeGreaterThan(600);
    expect(png.topColours).toBeGreaterThan(20);
  });

  test('stitches long documents into one complete image', async ({ launch, workspace }) => {
    // Far taller than one capture tile (Chromium leaves single captures above ~16k px blank).
    const paragraphs = Array.from({ length: 700 }, (_, i) => `Paragraph ${i + 1} of a very long document.`);
    const source = await workspace.write('long.md', `# Long\n\n${paragraphs.join('\n\n')}\n\n## The end\n`);
    const app = await launch({ files: [source] });
    const target = workspace.path('long.png');
    await app.stubs.queueSave(target);
    await runCommand(app, 'Export as Image (PNG)…');

    await expect(app.window.getByRole('status').filter({ hasText: `Exported to ${target}` })).toBeVisible({
      timeout: 60_000,
    });
    const png = await inspectPng(app, target);
    expect(png.height).toBeGreaterThan(16_384);
    // Very long documents fall back from 2× to 1× so the image stays at most 32 768 px tall.
    expect([DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_WIDTH * 2]).toContain(png.width);
    expect(png.height).toBeLessThanOrEqual(32_768);
    // The end of the document is rendered, not left blank.
    expect(png.bottomColours).toBeGreaterThan(20);
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
