import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateProgress } from '../../shared/types';
import type { HttpGet, HttpGetOptions } from './httpClient';
import { CHECKSUMS_FILE_NAME, LATEST_RELEASE_API_URL, UpdateError, type InstallTarget } from './updateCore';
import {
  CHECK_TIMEOUT_MS,
  DOWNLOAD_IDLE_TIMEOUT_MS,
  FileSink,
  UpdateService,
  WINDOWS_INSTALLER_ARGS,
  type UpdateServiceOptions,
} from './updateService';

const DOWNLOAD = 'https://github.com/Amadudl/MarkDownPlusPlus/releases/download/v1.1.0';
const SETUP = 'MarkDownPlusPlus-1.1.0-win-x64-setup.exe';
const DMG = 'MarkDownPlusPlus-1.1.0-mac-arm64.dmg';
const APPIMAGE = 'MarkDownPlusPlus-1.1.0-linux-x86_64.AppImage';
const INSTALLER: InstallTarget = { mode: 'installer', assetSuffix: 'win-x64-setup.exe' };

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

/** Contents of the release files served by the fake network. */
const PACKAGES: Readonly<Record<string, Buffer>> = {
  [SETUP]: Buffer.from('new windows installer '.repeat(500)),
  [DMG]: Buffer.from('new disk image '.repeat(300)),
  [APPIMAGE]: Buffer.from('new appimage '.repeat(400)),
};

function checksums(overrides: Readonly<Record<string, string>> = {}): Buffer {
  const lines = Object.entries(PACKAGES).map(([name, data]) => `${overrides[name] ?? sha256(data)}  ${name}`);
  return Buffer.from(`${lines.join('\n')}\n`);
}

function releaseJson(version = '1.1.0', files: Readonly<Record<string, Buffer>> = {}): string {
  const tag = `v${version}`;
  return JSON.stringify({
    tag_name: tag,
    name: `MarkDown++ ${version}`,
    html_url: `https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    published_at: '2026-11-01T10:00:00Z',
    assets: Object.entries(files).map(([name, data]) => ({
      name,
      size: data.length,
      browser_download_url: `https://github.com/Amadudl/MarkDownPlusPlus/releases/download/${tag}/${name}`,
    })),
  });
}

interface FakeNetwork {
  readonly httpGet: HttpGet;
  readonly calls: { url: string; options: HttpGetOptions }[];
  readonly files: Map<string, Buffer | Error>;
}

/** Serves `files` by URL in chunks of 1000 bytes; unknown URLs fail like a 404. */
function fakeNetwork(entries: Readonly<Record<string, Buffer | Error>>): FakeNetwork {
  const files = new Map(Object.entries(entries));
  const calls: FakeNetwork['calls'] = [];
  const httpGet: HttpGet = (url, options) => {
    calls.push({ url, options });
    const file = files.get(url);
    if (file === undefined) return Promise.reject(new UpdateError(`HTTP 404 for ${url}`));
    if (file instanceof Error) return Promise.reject(file);
    try {
      for (let offset = 0; offset < file.length; offset += 1000)
        options.onData(file.subarray(offset, offset + 1000));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return Promise.resolve();
  };
  return { httpGet, calls, files };
}

/** A network with the latest release (1.1.0 with every package and the checksum file). */
function releaseNetwork(sums: Buffer = checksums()): FakeNetwork {
  const files = { ...PACKAGES, [CHECKSUMS_FILE_NAME]: sums };
  return fakeNetwork({
    [LATEST_RELEASE_API_URL]: Buffer.from(releaseJson('1.1.0', files)),
    ...Object.fromEntries(Object.entries(files).map(([name, data]) => [`${DOWNLOAD}/${name}`, data])),
  });
}

let dir: string;
let downloadDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-update-'));
  downloadDir = join(dir, 'downloads');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface Harness {
  readonly service: UpdateService;
  readonly network: FakeNetwork;
  readonly progress: UpdateProgress[];
  readonly options: {
    openPath: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>;
    openExternal: ReturnType<typeof vi.fn<(url: string) => Promise<boolean>>>;
    requestQuit: ReturnType<typeof vi.fn<() => void>>;
    relaunch: ReturnType<typeof vi.fn<(execPath: string) => void>>;
    spawnDetached: ReturnType<typeof vi.fn<(file: string, args: readonly string[]) => void>>;
  };
}

function harness(
  target: InstallTarget = INSTALLER,
  network: FakeNetwork = releaseNetwork(),
  overrides: Partial<UpdateServiceOptions> = {},
): Harness {
  const progress: UpdateProgress[] = [];
  const options = {
    openPath: vi.fn<(path: string) => Promise<string>>(() => Promise.resolve('')),
    openExternal: vi.fn<(url: string) => Promise<boolean>>(() => Promise.resolve(true)),
    requestQuit: vi.fn<() => void>(),
    relaunch: vi.fn<(execPath: string) => void>(),
    spawnDetached: vi.fn<(file: string, args: readonly string[]) => void>(),
  };
  const service = new UpdateService({
    currentVersion: '1.0.5',
    target,
    httpGet: network.httpGet,
    apiUrl: LATEST_RELEASE_API_URL,
    downloadDir,
    userAgent: 'MarkDownPlusPlus/1.0.5',
    ...options,
    onProgress: (event) => progress.push(event),
    defer: (callback) => callback(),
    randomId: () => '0123456789abcdef',
    ...overrides,
  });
  return { service, network, progress, options };
}

describe('UpdateService.check', () => {
  it('reports a newer release with the install mode and download size of this installation', async () => {
    const { service, network } = harness();
    const result = await service.check();
    expect(result).toEqual({
      status: 'available',
      update: {
        version: '1.1.0',
        currentVersion: '1.0.5',
        releaseName: 'MarkDown++ 1.1.0',
        releaseUrl: 'https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v1.1.0',
        publishedAt: '2026-11-01T10:00:00Z',
        installMode: 'installer',
        downloadSize: PACKAGES[SETUP]?.length,
      },
    });
    const [call] = network.calls;
    expect(call?.url).toBe(LATEST_RELEASE_API_URL);
    expect(call?.options).toMatchObject({
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MarkDownPlusPlus/1.0.5',
      },
      timeoutMs: CHECK_TIMEOUT_MS,
    });
    const allowed = call?.options.isAllowedUrl;
    expect(allowed?.(new URL('https://api.github.com/repos/x/y/releases/latest'))).toBe(true);
    expect(allowed?.(new URL('https://evil.example/repos'))).toBe(false);
    expect(allowed?.(new URL('https://user:pw@api.github.com/'))).toBe(false);
    expect(allowed?.(new URL('https://api.github.com:8443/'))).toBe(false);
  });

  it('offers installations that cannot update themselves the release page', async () => {
    const { service } = harness({ mode: 'manual' });
    const result = await service.check();
    expect(result).toMatchObject({
      status: 'available',
      update: { installMode: 'manual', downloadSize: null },
    });
  });

  it('is up to date when the latest release is not newer', async () => {
    for (const version of ['1.0.5', '1.0.4']) {
      const network = fakeNetwork({ [LATEST_RELEASE_API_URL]: Buffer.from(releaseJson(version)) });
      expect(await harness(INSTALLER, network).service.check()).toEqual({
        status: 'up-to-date',
        currentVersion: '1.0.5',
        latestVersion: version,
      });
    }
  });

  it('never offers drafts or pre-releases', async () => {
    const json = { ...(JSON.parse(releaseJson('9.0.0')) as Record<string, unknown>), prerelease: true };
    const network = fakeNetwork({ [LATEST_RELEASE_API_URL]: Buffer.from(JSON.stringify(json)) });
    expect(await harness(INSTALLER, network).service.check()).toEqual({
      status: 'up-to-date',
      currentVersion: '1.0.5',
      latestVersion: '1.0.5',
    });
  });

  it('rejects invalid responses and passes network failures on', async () => {
    const invalid = fakeNetwork({ [LATEST_RELEASE_API_URL]: Buffer.from('<html>rate limited</html>') });
    await expect(harness(INSTALLER, invalid).service.check()).rejects.toThrow(
      'GitHub sent an invalid response.',
    );
    const offline = fakeNetwork({
      [LATEST_RELEASE_API_URL]: new UpdateError('The connection to api.github.com timed out.'),
    });
    await expect(harness(INSTALLER, offline).service.check()).rejects.toThrow('timed out');
  });

  it('forgets an offered update once the check finds nothing newer', async () => {
    const network = releaseNetwork();
    const { service } = harness(INSTALLER, network);
    await service.check();
    network.files.set(LATEST_RELEASE_API_URL, Buffer.from(releaseJson('1.0.5')));
    await service.check();
    await expect(service.install('1.1.0')).rejects.toThrow('no longer current');
  });
});

describe('UpdateService.install', () => {
  it('refuses versions that the last check did not offer', async () => {
    const { service } = harness();
    await expect(service.install('1.1.0')).rejects.toThrow('Check for updates again.');
    await service.check();
    await expect(service.install('1.2.0')).rejects.toBeInstanceOf(UpdateError);
  });

  it('opens the release page for installations that cannot update themselves', async () => {
    const { service, options, network } = harness({ mode: 'manual' });
    await service.check();
    expect(await service.install('1.1.0')).toBe('release-page-opened');
    expect(options.openExternal).toHaveBeenCalledWith(
      'https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v1.1.0',
    );
    expect(network.calls).toHaveLength(1);
    options.openExternal.mockResolvedValueOnce(false);
    await expect(service.install('1.1.0')).rejects.toThrow('The release page could not be opened.');
  });

  it('downloads and verifies the Windows setup, then quits and runs it silently once the app closed', async () => {
    const { service, options, progress, network } = harness();
    await service.check();
    expect(await service.install('1.1.0')).toBe('restarting');

    const file = join(downloadDir, `tmp_0123456789abcdef_${SETUP}`);
    expect(await readFile(file)).toEqual(PACKAGES[SETUP]);
    expect(network.calls.map((call) => call.url)).toEqual([
      LATEST_RELEASE_API_URL,
      `${DOWNLOAD}/${CHECKSUMS_FILE_NAME}`,
      `${DOWNLOAD}/${SETUP}`,
    ]);
    const download = network.calls[2]?.options;
    expect(download).toMatchObject({
      timeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
      maxBytes: PACKAGES[SETUP]?.length,
    });
    expect(download?.isAllowedUrl(new URL('https://release-assets.githubusercontent.com/a'))).toBe(true);
    expect(download?.isAllowedUrl(new URL('https://evil.example/a'))).toBe(false);

    expect(progress[0]).toEqual({
      phase: 'downloading',
      receivedBytes: 0,
      totalBytes: PACKAGES[SETUP]?.length,
    });
    expect(progress.at(-2)).toEqual({
      phase: 'downloading',
      receivedBytes: PACKAGES[SETUP]?.length,
      totalBytes: PACKAGES[SETUP]?.length,
    });
    expect(progress.at(-1)).toEqual({ phase: 'verifying' });
    expect(options.requestQuit).toHaveBeenCalledTimes(1);
    // Nothing runs before every window has closed.
    expect(options.spawnDetached).not.toHaveBeenCalled();
    expect(service.hasPendingInstall).toBe(true);
    await expect(service.install('1.1.0')).rejects.toThrow('installed when MarkDown++ closes');

    expect(service.runPendingInstall()).toBe(true);
    expect(options.spawnDetached).toHaveBeenCalledWith(file, WINDOWS_INSTALLER_ARGS);
    expect(WINDOWS_INSTALLER_ARGS).toEqual(['--updated', '/S', '--force-run']);
    expect(service.runPendingInstall()).toBe(false);
    service.cancelPendingInstall();
    expect(progress.at(-1)).toEqual({ phase: 'verifying' });
  });

  it('drops the pending install and tells the user when the app does not quit', async () => {
    const { service, options, progress } = harness();
    await service.check();
    await service.install('1.1.0');
    service.cancelPendingInstall();
    expect(progress.at(-1)).toEqual({
      phase: 'cancelled',
      message: expect.stringContaining('was not installed') as unknown,
    });
    expect(service.runPendingInstall()).toBe(false);
    expect(options.spawnDetached).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(await readdir(downloadDir)).toEqual([]));
  });

  it('refuses a second install while one is downloading', async () => {
    const { service } = harness();
    await service.check();
    const first = service.install('1.1.0');
    await expect(service.install('1.1.0')).rejects.toThrow('already being downloaded');
    await expect(first).resolves.toBe('restarting');
  });

  it('deletes a download whose checksum does not match and never runs it', async () => {
    const { service, options } = harness(INSTALLER, releaseNetwork(checksums({ [SETUP]: 'f'.repeat(64) })));
    await service.check();
    await expect(service.install('1.1.0')).rejects.toThrow('does not match its published SHA-256 checksum');
    expect(await readdir(downloadDir)).toEqual([]);
    expect(options.requestQuit).not.toHaveBeenCalled();
    expect(service.runPendingInstall()).toBe(false);
  });

  it('does not download a file that has no published checksum', async () => {
    const sums = Buffer.from(`${'a'.repeat(64)}  other-file.exe\n`);
    const { service, network } = harness(INSTALLER, releaseNetwork(sums));
    await service.check();
    await expect(service.install('1.1.0')).rejects.toThrow(`SHA256SUMS.txt lists no checksum for ${SETUP}`);
    expect(network.calls.map((call) => call.url)).not.toContain(`${DOWNLOAD}/${SETUP}`);
  });

  it('deletes partial downloads when the transfer fails', async () => {
    const network = releaseNetwork();
    const { service } = harness(INSTALLER, network);
    await service.check();
    network.files.set(
      `${DOWNLOAD}/${SETUP}`,
      new UpdateError('The download from github.com was interrupted.'),
    );
    await expect(service.install('1.1.0')).rejects.toThrow('interrupted');
    expect(await readdir(downloadDir)).toEqual([]);
  });

  it('rejects a download that ends early', async () => {
    const network = releaseNetwork();
    const { service } = harness(INSTALLER, network);
    await service.check();
    network.files.set(`${DOWNLOAD}/${SETUP}`, Buffer.from('short'));
    await expect(service.install('1.1.0')).rejects.toThrow(`The download of ${SETUP} was incomplete.`);
    expect(await readdir(downloadDir)).toEqual([]);
  });

  it('removes downloads of earlier attempts but nothing else', async () => {
    await mkdir(join(downloadDir, 'tmp_fedcba9876543210_MarkDownPlusPlus-locked'), { recursive: true });
    await writeFile(
      join(downloadDir, 'tmp_aaaaaaaaaaaaaaaa_MarkDownPlusPlus-1.0.9-win-x64-setup.exe'),
      'old',
    );
    await writeFile(join(downloadDir, 'notes.txt'), 'keep');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { service } = harness();
      await service.check();
      await service.install('1.1.0');
      expect((await readdir(downloadDir)).sort()).toEqual([
        'notes.txt',
        `tmp_0123456789abcdef_${SETUP}`,
        'tmp_fedcba9876543210_MarkDownPlusPlus-locked',
      ]);
      // A leftover that cannot be deleted only costs disk space.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('tmp_fedcba9876543210_MarkDownPlusPlus-locked'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('opens the verified disk image on macOS', async () => {
    const { service, options } = harness({ mode: 'disk-image', assetSuffix: 'mac-arm64.dmg' });
    await service.check();
    expect(await service.install('1.1.0')).toBe('disk-image-opened');
    const file = join(downloadDir, `tmp_0123456789abcdef_${DMG}`);
    expect(options.openPath).toHaveBeenCalledWith(file);
    expect(await readFile(file)).toEqual(PACKAGES[DMG]);
    expect(options.requestQuit).not.toHaveBeenCalled();
    expect(service.hasPendingInstall).toBe(false);
  });

  it('reports a disk image the system cannot open and deletes it', async () => {
    const { service, options } = harness({ mode: 'disk-image', assetSuffix: 'mac-arm64.dmg' });
    options.openPath.mockResolvedValueOnce('No application can open this file');
    await service.check();
    await expect(service.install('1.1.0')).rejects.toThrow(
      'The disk image could not be opened: No application can open this file',
    );
    expect(await readdir(downloadDir)).toEqual([]);
  });

  it('replaces the AppImage atomically and relaunches it once the app closed', async () => {
    const apps = join(dir, 'Apps');
    await mkdir(apps);
    const appImagePath = join(apps, 'MarkDown++.AppImage');
    await writeFile(appImagePath, 'old appimage');
    await writeFile(join(apps, 'tmp_aaaaaaaaaaaaaaaa_unrelated.AppImage'), 'keep');
    const { service, options } = harness({
      mode: 'appimage',
      assetSuffix: 'linux-x86_64.AppImage',
      appImagePath,
    });
    await service.check();
    expect(await service.install('1.1.0')).toBe('restarting');
    // Nothing is replaced before every window has closed (unsaved changes were asked about).
    expect(await readFile(appImagePath, 'utf8')).toBe('old appimage');
    expect(options.requestQuit).toHaveBeenCalledTimes(1);
    expect(options.relaunch).not.toHaveBeenCalled();
    expect(service.runPendingInstall()).toBe(true);
    expect(await readFile(appImagePath)).toEqual(PACKAGES[APPIMAGE]);
    if (process.platform !== 'win32') expect((await stat(appImagePath)).mode & 0o777).toBe(0o755);
    expect((await readdir(apps)).sort()).toEqual([
      'MarkDown++.AppImage',
      'tmp_aaaaaaaaaaaaaaaa_unrelated.AppImage',
    ]);
    expect(options.relaunch).toHaveBeenCalledWith(appImagePath);
  });

  it('aborts the AppImage update and keeps the old AppImage when the app does not quit', async () => {
    const appImagePath = join(dir, 'MarkDown++.AppImage');
    await writeFile(appImagePath, 'old');
    const { service, progress, options } = harness({
      mode: 'appimage',
      assetSuffix: 'linux-x86_64.AppImage',
      appImagePath,
    });
    await service.check();
    await service.install('1.1.0');
    service.cancelPendingInstall();
    expect(progress.at(-1)).toEqual({
      phase: 'cancelled',
      message: expect.stringContaining('was not installed') as unknown,
    });
    expect(await readFile(appImagePath, 'utf8')).toBe('old');
    await vi.waitFor(async () => expect(await readdir(dir)).toEqual(['MarkDown++.AppImage']));
    expect(service.runPendingInstall()).toBe(false);
    expect(options.relaunch).not.toHaveBeenCalled();
  });

  it('quits after the reply was sent and uses random download names by default', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const { service, options } = harness(INSTALLER, releaseNetwork(), {
        defer: undefined,
        randomId: undefined,
      });
      await service.check();
      await service.install('1.1.0');
      expect(options.requestQuit).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(options.requestQuit).toHaveBeenCalledTimes(1);
      const [name] = await readdir(downloadDir);
      expect(name).toMatch(new RegExp(`^tmp_[0-9a-f]{16}_${SETUP.replace(/[.+]/g, '\\$&')}$`));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FileSink', () => {
  it('writes chunks in order', async () => {
    const written: string[] = [];
    const handle = {
      write: vi.fn(async (chunk: Buffer) => {
        await Promise.resolve();
        written.push(chunk.toString());
      }),
      close: vi.fn(() => Promise.resolve()),
    };
    const sink = new FileSink(handle as never);
    sink.write(Buffer.from('a'));
    sink.write(Buffer.from('b'));
    await sink.close();
    expect(written).toEqual(['a', 'b']);
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it('reports the first write error on the next write and on close', async () => {
    const failure = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    const handle = {
      write: vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce('second'),
      close: vi.fn(() => Promise.resolve()),
    };
    const sink = new FileSink(handle as never);
    sink.write(Buffer.from('a'));
    sink.write(Buffer.from('b'));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => sink.write(Buffer.from('c'))).toThrow(failure);
    await expect(sink.close()).rejects.toBe(failure);
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it('wraps non-Error write failures', async () => {
    const handle = { write: vi.fn().mockRejectedValueOnce('odd'), close: vi.fn(() => Promise.resolve()) };
    const sink = new FileSink(handle as never);
    sink.write(Buffer.from('a'));
    await expect(sink.close()).rejects.toThrow('odd');
  });
});
