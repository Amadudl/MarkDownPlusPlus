import { existsSync } from 'node:fs';
import type { DomImage, RendererGlobals } from './dom';
import { expect, test, visualEditor, type LaunchedApp } from './fixtures';

/** Records `will-navigate` attempts of the app window in the main process. */
async function recordNavigations(app: LaunchedApp): Promise<void> {
  await app.electronApp.evaluate(({ BrowserWindow }) => {
    const holder = globalThis as unknown as { __mppNavigations: string[] };
    holder.__mppNavigations = [];
    BrowserWindow.getAllWindows()[0]?.webContents.on('will-navigate', (event) => {
      holder.__mppNavigations.push(event.url);
    });
  });
}

function navigations(app: LaunchedApp): Promise<string[]> {
  return app.electronApp.evaluate(
    () => (globalThis as unknown as { __mppNavigations: string[] }).__mppNavigations,
  );
}

/** Loads `src` into an `<img>` in the renderer and reports whether it loaded. */
function loadImage(app: LaunchedApp, src: string): Promise<'load' | 'error'> {
  return app.window.evaluate(
    (url) =>
      new Promise<'load' | 'error'>((resolve) => {
        const doc = (globalThis as unknown as RendererGlobals).document as unknown as {
          createElement(tag: 'img'): DomImage & {
            src: string;
            onload: (() => void) | null;
            onerror: (() => void) | null;
          };
        };
        const image = doc.createElement('img');
        image.onload = () => resolve('load');
        image.onerror = () => resolve('error');
        image.src = url;
      }),
    src,
  );
}

function mppFileUrl(path: string): string {
  return `mpp-file://local/${encodeURIComponent(path)}`;
}

test.describe('Security', () => {
  test('the renderer has no Node.js globals', async ({ mpp }) => {
    const types = await mpp.window.evaluate(() => {
      const scope = globalThis as unknown as Record<string, unknown>;
      return ['require', 'process', 'module', 'exports', 'Buffer', 'global', '__dirname', 'electron'].map(
        (name) => `${name}:${typeof scope[name]}`,
      );
    });
    expect(types).toEqual([
      'require:undefined',
      'process:undefined',
      'module:undefined',
      'exports:undefined',
      'Buffer:undefined',
      'global:undefined',
      '__dirname:undefined',
      'electron:undefined',
    ]);
  });

  test('window.mpp is the only bridge and exposes plain functions only', async ({ mpp }) => {
    const surface = await mpp.window.evaluate(() => {
      const api = (globalThis as unknown as { mpp: Record<string, Record<string, unknown>> }).mpp;
      const groups = Object.keys(api).sort();
      const members = groups.map(
        (group) =>
          `${group}: ${Object.entries(api[group] ?? {})
            .map(([name, value]) => `${name}=${typeof value}`)
            .sort()
            .join(',')}`,
      );
      return { groups, members, frozen: Object.isFrozen(api) || !Object.isExtensible(api) };
    });
    expect(surface.groups).toEqual(['app', 'file', 'recent', 'session', 'settings']);
    for (const line of surface.members) expect(line).not.toMatch(/=(object|string|number)/);
    expect(surface.members.join('\n')).not.toMatch(/ipcRenderer|invoke|send=|on=/);
    expect(surface.frozen).toBe(true);
  });

  test('the Content-Security-Policy is delivered and blocks eval', async ({ mpp }) => {
    mpp.console.allow(/Content Security Policy|unsafe-eval|EvalError/i);
    const result = await mpp.window.evaluate(async () => {
      const scope = globalThis as unknown as RendererGlobals;
      const meta =
        scope.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ??
        '';
      const response = await scope.fetch(scope.location.href);
      const header = response.headers.get('content-security-policy') ?? '';
      let evalBlocked = false;
      try {
        scope.eval('1 + 1');
      } catch {
        evalBlocked = true;
      }
      return { meta, header, evalBlocked, url: scope.location.href };
    });
    expect(result.url).toBe('mpp-app://bundle/index.html');
    for (const policy of [result.meta, result.header]) {
      expect(policy).toContain("default-src 'self'");
      expect(policy).toMatch(/script-src 'self'(;|$)/);
      expect(policy).toContain("object-src 'none'");
      expect(policy).not.toContain('unsafe-eval');
    }
    expect(result.header).toContain("frame-ancestors 'none'");
    expect(result.evalBlocked).toBe(true);
  });

  test('window.open never creates a window; safe URLs go to the OS browser', async ({ mpp }) => {
    // Chromium reports the blocked attempts on the console.
    mpp.console.allow(/Not allowed to load local resource: file:\/\/\/etc\/passwd/);
    mpp.console.allow(/Running the JavaScript URL violates the following Content Security Policy/);
    const results = await mpp.window.evaluate(() => {
      const scope = globalThis as unknown as RendererGlobals;
      return [
        scope.open('https://example.com/docs', '_blank') === null,
        scope.open('file:///etc/passwd') === null,
        scope.open('javascript:alert(1)') === null,
      ];
    });
    expect(results).toEqual([true, true, true]);
    await expect
      .poll(async () => (await mpp.stubs.calls('openExternal')).map((call) => call.detail))
      .toEqual(['https://example.com/docs']);
    expect(mpp.electronApp.windows()).toHaveLength(1);
    expect(await mpp.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
      1,
    );
  });

  test('the window cannot navigate away from the app', async ({ mpp }) => {
    await recordNavigations(mpp);
    await mpp.window.evaluate(() => {
      const scope = globalThis as unknown as Record<string, unknown> & { location: { href: string } };
      scope.__mppMarker = 'still here';
      scope.location.href = 'https://example.com/';
    });
    await expect.poll(() => navigations(mpp)).toEqual(['https://example.com/']);
    expect(mpp.window.url()).toBe('mpp-app://bundle/index.html');
    const marker = await mpp.window.evaluate(
      () => (globalThis as unknown as Record<string, unknown>).__mppMarker,
    );
    expect(marker).toBe('still here');
  });

  test('raw HTML in a document is never executed', async ({ launch, workspace }) => {
    const path = await workspace.write(
      'evil.md',
      '# Evil\n\n<img src="x" onerror="window.__pwned = 1">\n\n<script>window.__pwned = 2;</script>\n\n[click](javascript:window.__pwned=3)\n',
    );
    const app = await launch({ files: [path] });
    const { window } = app;
    await expect(visualEditor(window).getByRole('heading', { name: 'Evil' })).toBeVisible();
    await visualEditor(window).getByText('click').click();
    const pwned = await window.evaluate(() => (globalThis as unknown as Record<string, unknown>).__pwned);
    expect(pwned).toBeUndefined();
    expect(window.url()).toBe('mpp-app://bundle/index.html');
  });

  test('mpp-file serves local images only', async ({ mpp, workspace }) => {
    mpp.console.allow(/Failed to load resource: the server responded with a status of 40[34]/);
    expect(await loadImage(mpp, mppFileUrl(workspace.path('images/pixel.png')))).toBe('load');
    expect(await loadImage(mpp, mppFileUrl(workspace.path('notes.md')))).toBe('error');
    expect(await loadImage(mpp, mppFileUrl(workspace.path('missing.png')))).toBe('error');
    expect(await loadImage(mpp, `${mppFileUrl(workspace.path('images'))}%2F..%2Fnotes.md`)).toBe('error');
  });

  test('the main process rejects writes to paths the user never chose', async ({ launch, workspace }) => {
    const app = await launch({ allowConsole: [/Error occurred in handler for 'file:save'/] });
    const target = workspace.path('not-granted.md');
    const outcome = await app.window.evaluate(async (path) => {
      const api = (
        globalThis as unknown as {
          mpp: { file: { save(request: object): Promise<unknown> } };
        }
      ).mpp;
      try {
        await api.file.save({ path, content: 'owned', lineEnding: 'lf', hasBom: false });
        return 'written';
      } catch {
        return 'rejected';
      }
    }, target);
    expect(outcome).toBe('rejected');
    expect(existsSync(target)).toBe(false);
  });

  test('the main process validates IPC arguments', async ({ launch }) => {
    const app = await launch({ allowConsole: [/Error occurred in handler for '(settings:set|file:read)'/] });
    const outcomes = await app.window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mpp: {
            settings: { set(patch: unknown): Promise<unknown> };
            file: { read(path: unknown): Promise<unknown> };
          };
        }
      ).mpp;
      const attempt = async (run: () => Promise<unknown>): Promise<string> => {
        try {
          await run();
          return 'accepted';
        } catch {
          return 'rejected';
        }
      };
      return [
        await attempt(() => api.settings.set({ appearance: { zoom: 99 } })),
        await attempt(() => api.file.read('relative/path.md')),
        await attempt(() => api.file.read('/tmp/\0evil.md')),
        await attempt(() => api.file.read(42)),
      ];
    });
    expect(outcomes).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
    await expect(app.window.locator('html')).toHaveCSS('zoom', '1');
  });

  test('permission requests are denied', async ({ mpp }) => {
    const permission = await mpp.window.evaluate(async () => {
      const scope = globalThis as unknown as { Notification: { requestPermission(): Promise<string> } };
      return scope.Notification.requestPermission();
    });
    expect(permission).toBe('denied');
  });
});
