/**
 * The in-app update function against a local stub of the GitHub releases API
 * (`MPP_UPDATE_API_URL`, honoured only by unpackaged builds). No request leaves
 * the machine. Unpackaged builds cannot install updates in place, so the notice
 * offers the release page, which the stubbed shell records instead of opening.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { APP_DIR, expect, runCommand, test } from './fixtures';

const RELEASE_PAGE = 'https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v99.0.0';

interface Stub {
  readonly url: string;
  /** Number of requests the stub answered. */
  hits(): number;
  close(): Promise<void>;
}

/** Serves `body` (JSON) with `status` for every request on a loopback port. */
async function startStub(status: number, body: unknown): Promise<Stub> {
  let hits = 0;
  const server: Server = createServer((_request, response) => {
    hits += 1;
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/repos/Amadudl/MarkDownPlusPlus/releases/latest`,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function release(version: string): Record<string, unknown> {
  return {
    tag_name: `v${version}`,
    name: `MarkDown++ ${version}`,
    html_url: `https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v${version}`,
    draft: false,
    prerelease: false,
    published_at: '2026-11-01T10:00:00Z',
    assets: [],
  };
}

async function appVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(APP_DIR, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

test.describe('updates', () => {
  test('announces a newer release found at startup and opens its page', async ({ launch }) => {
    const stub = await startStub(200, release('99.0.0'));
    try {
      const app = await launch({ env: { MPP_UPDATE_API_URL: stub.url } });
      const notice = app.window.getByRole('region', { name: 'Software update' });
      await expect(notice).toContainText('Version 99.0.0 is available', { timeout: 20_000 });
      await expect(notice).toContainText(`You have version ${await appVersion()}.`);
      await expect(notice).toContainText('This installation cannot update itself.');
      expect(stub.hits()).toBe(1);

      await notice.getByRole('button', { name: 'Release notes' }).click();
      await expect
        .poll(async () => (await app.stubs.calls('openExternal')).map((call) => call.detail))
        .toEqual([RELEASE_PAGE]);

      await notice.getByRole('button', { name: 'Open download page' }).click();
      await expect(notice).toBeHidden();
      expect((await app.stubs.calls('openExternal')).map((call) => call.detail)).toEqual([
        RELEASE_PAGE,
        RELEASE_PAGE,
      ]);
    } finally {
      await stub.close();
    }
  });

  test('a manual check reports an up-to-date app; the startup check can be switched off', async ({
    launch,
  }) => {
    const version = await appVersion();
    const stub = await startStub(200, release(version));
    try {
      const app = await launch({
        env: { MPP_UPDATE_API_URL: stub.url },
        settings: { general: { checkForUpdatesOnStartup: false } },
      });
      await runCommand(app, 'Check for Updates…');
      const notice = app.window.getByRole('region', { name: 'Software update' });
      await expect(notice).toContainText('MarkDown++ is up to date');
      await expect(notice).toContainText(`Version ${version} is the latest version.`);
      await notice.getByRole('button', { name: 'OK' }).click();
      await expect(notice).toBeHidden();
      // The background check (4 s after startup) stays off.
      await app.window.waitForTimeout(6000);
      expect(stub.hits()).toBe(1);
    } finally {
      await stub.close();
    }
  });

  test('a failed manual check is shown with a way to the download page', async ({ launch }) => {
    const stub = await startStub(500, { message: 'Server Error' });
    try {
      const app = await launch({
        env: { MPP_UPDATE_API_URL: stub.url },
        settings: { general: { checkForUpdatesOnStartup: false } },
      });
      await runCommand(app, 'Check for Updates…');
      const notice = app.window.getByRole('region', { name: 'Software update' });
      await expect(notice).toContainText('Could not check for updates');
      await expect(notice).toContainText('answered with HTTP status 500');
      await notice.getByRole('button', { name: 'Open download page' }).click();
      await expect
        .poll(async () => (await app.stubs.calls('openExternal')).map((call) => call.detail))
        .toEqual(['https://github.com/Amadudl/MarkDownPlusPlus/releases/latest']);
    } finally {
      await stub.close();
    }
  });

  test('the startup check setting is a switch in Settings → General and persists', async ({
    launch,
    userDataDir,
  }) => {
    const app = await launch();
    const { window } = app;
    await window.getByRole('button', { name: 'Settings' }).click();
    const dialog = window.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('tab', { name: 'General' }).click();
    const toggle = dialog.getByRole('switch', { name: 'Check for updates at startup' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect
      .poll(async () => {
        const saved = JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')) as {
          general?: { checkForUpdatesOnStartup?: boolean };
        };
        return saved.general?.checkForUpdatesOnStartup;
      })
      .toBe(false);
  });
});
