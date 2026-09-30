import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toMppFileUrl } from '../shared/file-url';

const electron = vi.hoisted(() => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
}));
vi.mock('electron', () => electron);

const {
  APP_ENTRY_URL,
  APP_ORIGIN,
  bundleMimeType,
  createAppProtocolHandler,
  createFileProtocolHandler,
  installProtocols,
  registerPrivilegedSchemes,
  resolveBundlePath,
  SVG_CSP,
} = await import('./protocol');

let dir: string;
let root: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-protocol-'));
  root = join(dir, 'renderer');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(join(root, 'assets', 'app.js'), 'console.warn(1);');
  await writeFile(join(root, 'assets', 'font.woff2'), 'font');
  await writeFile(join(root, 'assets', 'data.bin'), 'bin');
  await writeFile(join(dir, 'secret.txt'), 'secret');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('constants and registration', () => {
  it('exposes the app origin and entry page', () => {
    expect(APP_ORIGIN).toBe('mpp-app://bundle');
    expect(APP_ENTRY_URL).toBe('mpp-app://bundle/index.html');
  });

  it('registers both schemes as privileged', () => {
    registerPrivilegedSchemes();
    const schemes = electron.protocol.registerSchemesAsPrivileged.mock.calls[0]?.[0] as { scheme: string }[];
    expect(schemes.map((scheme) => scheme.scheme)).toEqual(['mpp-app', 'mpp-file']);
  });

  it('installs both handlers', () => {
    installProtocols(root, 'csp');
    expect(electron.protocol.handle.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'mpp-app',
      'mpp-file',
    ]);
  });

  it('maps extensions to MIME types', () => {
    expect(bundleMimeType('a.js')).toBe('text/javascript; charset=utf-8');
    expect(bundleMimeType('a.WOFF2')).toBe('font/woff2');
    expect(bundleMimeType('a.unknown')).toBe('application/octet-stream');
  });
});

describe('resolveBundlePath', () => {
  it('maps bundle URLs into the root', () => {
    expect(resolveBundlePath(root, 'mpp-app://bundle/')).toBe(join(root, 'index.html'));
    expect(resolveBundlePath(root, 'mpp-app://bundle')).toBe(join(root, 'index.html'));
    expect(resolveBundlePath(root, 'mpp-app://bundle/assets/app.js?v=1')).toBe(
      join(root, 'assets', 'app.js'),
    );
    expect(resolveBundlePath(root, 'mpp-app://bundle/assets/a%20b.js')).toBe(join(root, 'assets', 'a b.js'));
  });

  it('keeps dot segments inside the root (the URL parser collapses them)', () => {
    expect(resolveBundlePath(root, 'mpp-app://bundle/%2e%2e/%2e%2e/secret.txt')).toBe(
      join(root, 'secret.txt'),
    );
  });

  it.each([
    ['not a url'],
    ['https://bundle/index.html'],
    ['mpp-app://other/index.html'],
    ['mpp-app://bundle/assets/%2e%2e%2f%2e%2e%2fsecret.txt'],
    ['mpp-app://bundle/..%5csecret.txt'],
    ['mpp-app://bundle/%00.js'],
    ['mpp-app://bundle/%E0%A4%A'],
  ])('rejects %s', (url) => {
    expect(resolveBundlePath(root, url)).toBeNull();
  });
});

describe('mpp-app handler', () => {
  const handler = (): ((request: Request) => Promise<Response>) => createAppProtocolHandler(root, 'the-csp');

  it('serves the entry page with CSP and nosniff', async () => {
    const response = await handler()(new Request('mpp-app://bundle/index.html'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBe('the-csp');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('<title>app</title>');
  });

  it('serves assets with their MIME type and without CSP', async () => {
    const response = await handler()(new Request('mpp-app://bundle/assets/app.js'));
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBeNull();
    const binary = await handler()(new Request('mpp-app://bundle/assets/data.bin'));
    expect(binary.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('answers HEAD without a body', async () => {
    const response = await handler()(new Request('mpp-app://bundle/assets/font.woff2', { method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('rejects other methods', async () => {
    const response = await handler()(
      new Request('mpp-app://bundle/index.html', { method: 'POST', body: 'x' }),
    );
    expect(response.status).toBe(405);
  });

  it('returns 404 for traversal, folders, missing files and escaping symlinks', async () => {
    await symlink(join(dir, 'secret.txt'), join(root, 'link.txt'));
    for (const url of [
      'mpp-app://bundle/%2e%2e/secret.txt',
      'mpp-app://bundle/assets',
      'mpp-app://bundle/missing.js',
      'mpp-app://bundle/link.txt',
    ]) {
      const response = await handler()(new Request(url));
      expect(response.status, url).toBe(404);
    }
  });
});

describe('mpp-file handler', () => {
  const handler = createFileProtocolHandler();

  it('serves allowlisted images', async () => {
    const path = join(dir, 'pic.png');
    await writeFile(path, Buffer.from([137, 80, 78, 71]));
    const response = await handler(new Request(toMppFileUrl(path)));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]));
  });

  it('serves SVG with a script-blocking CSP', async () => {
    const path = join(dir, 'pic.svg');
    await writeFile(path, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const response = await handler(new Request(toMppFileUrl(path)));
    expect(response.headers.get('content-security-policy')).toBe(SVG_CSP);
    expect(SVG_CSP).toContain("default-src 'none'");
  });

  it('refuses non-images, missing files, foreign URLs and non-GET requests', async () => {
    expect((await handler(new Request(toMppFileUrl(join(dir, 'secret.txt'))))).status).toBe(403);
    expect((await handler(new Request(toMppFileUrl(join(dir, 'missing.png'))))).status).toBe(404);
    expect((await handler(new Request('mpp-file://elsewhere/x.png'))).status).toBe(404);
    const post = new Request(toMppFileUrl(join(dir, 'pic.png')), { method: 'POST', body: 'x' });
    expect((await handler(post)).status).toBe(403);
  });

  it('applies the network path policy (Windows UNC paths)', async () => {
    const windows = createFileProtocolHandler({
      platform: 'win32',
      allowUncHost: (host) => host === 'files',
    });
    expect((await windows(new Request(toMppFileUrl('//evil.example/share/a.png')))).status).toBe(403);
    // An allowed server is read like any other path (missing here, so 404 rather than 403).
    expect((await windows(new Request(toMppFileUrl('//files/share/missing.png')))).status).toBe(404);
  });
});
