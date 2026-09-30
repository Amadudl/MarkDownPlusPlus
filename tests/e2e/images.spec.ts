import type { Locator } from '@playwright/test';
import type { DomImage } from './dom';
import { toMppFileUrl } from '../../src/shared/file-url';
import { expect, test, visualEditor } from './fixtures';

/** Waits until an `<img>` finished loading and returns its natural width and source. */
async function loadedImage(image: Locator): Promise<{ readonly width: number; readonly src: string }> {
  await expect
    .poll(() => image.evaluate((element: DomImage) => element.complete && element.naturalWidth > 0))
    .toBe(true);
  return image.evaluate((element: DomImage) => ({ width: element.naturalWidth, src: element.currentSrc }));
}

test.describe('Images', () => {
  test('a relative image renders through the mpp-file protocol', async ({ launch, workspace }) => {
    const app = await launch({ files: [workspace.path('picture.md')] });
    const image = visualEditor(app.window).locator('img').first();
    await expect(image).toBeVisible();
    const { width, src } = await loadedImage(image);
    expect(width).toBe(2);
    expect(src).toBe(toMppFileUrl(workspace.path('images/pixel.png')));
  });

  test('images are resolved relative to the document folder', async ({ launch, workspace }) => {
    const path = await workspace.write(
      'docs/nested.md',
      '# Nested\n\n![Up one level](../images/pixel.png)\n',
    );
    const app = await launch({ files: [path] });
    const image = visualEditor(app.window).locator('img').first();
    const { src } = await loadedImage(image);
    expect(src).toBe(toMppFileUrl(workspace.path('images/pixel.png')));
  });

  test('remote images are replaced by a placeholder when they are disabled', async ({
    launch,
    workspace,
  }) => {
    const path = await workspace.write(
      'remote.md',
      '# Remote\n\n![Remote](https://example.invalid/image.png)\n',
    );
    const app = await launch({ files: [path], settings: { rendering: { loadRemoteImages: false } } });
    const image = visualEditor(app.window).locator('img').first();
    await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/);
    const { src } = await loadedImage(image);
    expect(decodeURIComponent(src)).toContain('Image blocked');
  });

  test('toggling remote images in the settings updates open documents', async ({ launch, workspace }) => {
    const path = await workspace.write(
      'remote.md',
      '# Remote\n\n![Remote](https://example.invalid/image.png)\n',
    );
    const app = await launch({
      files: [path],
      // Once enabled, the image is requested; this host never resolves.
      allowConsole: [/Failed to load resource: net::ERR_NAME_NOT_RESOLVED/],
    });
    const { window } = app;
    const image = visualEditor(window).locator('img').first();
    // Remote images are off by default.
    await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/);

    const toggle = async (): Promise<void> => {
      await window.getByRole('button', { name: 'Settings' }).click();
      const dialog = window.getByRole('dialog', { name: 'Settings' });
      await dialog.getByRole('tab', { name: 'General' }).click();
      await dialog.getByRole('switch', { name: 'Load remote images' }).click();
      await dialog.getByRole('button', { name: 'Done' }).click();
    };
    await toggle();
    await expect(visualEditor(window).locator('img').first()).toHaveAttribute(
      'src',
      'https://example.invalid/image.png',
    );
    await toggle();
    await expect(visualEditor(window).locator('img').first()).toHaveAttribute('src', /^data:image\/svg\+xml/);
  });
});
