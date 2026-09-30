import { expect, test } from './fixtures';

const WARNING = 'MarkDown++ is running without the Chromium sandbox';

test.describe('Sandbox warning', () => {
  test('is not shown while the Chromium sandbox is active', async ({ mpp }) => {
    await expect(mpp.window.getByRole('heading', { name: 'MarkDown++' })).toBeVisible();
    const boxes = await mpp.stubs.calls('messageBox');
    expect(boxes.map((call) => call.detail)).not.toContain(WARNING);
  });

  test('warns once when the app runs with --no-sandbox and keeps working after Continue', async ({
    launch,
  }) => {
    const app = await launch({ switches: ['--no-sandbox'] });
    await expect
      .poll(async () => (await app.stubs.calls('messageBox')).map((call) => call.detail))
      .toContain(WARNING);
    // The stubbed dialog answers with its cancel button ("Continue"): the app stays usable.
    await expect(app.window.getByRole('heading', { name: 'MarkDown++' })).toBeVisible();
    const warnings = (await app.stubs.calls('messageBox')).filter((call) => call.detail === WARNING);
    expect(warnings).toHaveLength(1);
  });
});
