import { describe, expect, it } from 'vitest';
import {
  assetNameFor,
  CHECKSUMS_FILE_NAME,
  compareVersions,
  detectInstallTarget,
  isAllowedDownloadUrl,
  isReleaseDownloadUrl,
  isReleasePageUrl,
  LATEST_RELEASE_API_URL,
  MAX_ASSET_BYTES,
  MAX_CHECKSUMS_BYTES,
  parseChecksums,
  parseRelease,
  parseVersion,
  planUpdate,
  RELEASES_PAGE_URL,
  UpdateError,
  type InstallEnvironment,
} from './updateCore';

const DOWNLOAD = 'https://github.com/Amadudl/MarkDownPlusPlus/releases/download';

/** A release object as the GitHub API returns it (with a few extra fields the app ignores). */
function githubRelease(version = '1.1.0', names: readonly string[] = []): Record<string, unknown> {
  const tag = `v${version}`;
  return {
    url: 'https://api.github.com/repos/Amadudl/MarkDownPlusPlus/releases/1',
    tag_name: tag,
    name: `MarkDown++ ${version}`,
    html_url: `https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    published_at: '2026-11-01T10:00:00Z',
    body: '## Changes',
    assets: names.map((name) => ({
      name,
      size: name === CHECKSUMS_FILE_NAME ? 1800 : 100_000_000,
      content_type: 'application/octet-stream',
      browser_download_url: `${DOWNLOAD}/${tag}/${name}`,
    })),
  };
}

describe('parseVersion', () => {
  it('accepts major.minor.patch with an optional v and pre-release', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(parseVersion('v10.0.20')).toEqual({ major: 10, minor: 0, patch: 20, prerelease: [] });
    expect(parseVersion(' 1.1.0-beta.1 ')).toEqual({
      major: 1,
      minor: 1,
      patch: 0,
      prerelease: ['beta', '1'],
    });
  });

  it('rejects anything else', () => {
    for (const value of [
      '',
      '1.2',
      '1.2.3.4',
      '01.2.3',
      'x1.2.3',
      '1.2.3+build',
      '1.2.3-',
      '1.2.3-a..b',
      'vv1.2.3',
    ]) {
      expect(parseVersion(value), value).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('orders by major, minor and patch numerically', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('v1.0.5', '1.0.5')).toBe(0);
  });

  it('ranks a final release above its pre-releases and orders pre-releases by SemVer', () => {
    expect(compareVersions('1.1.0', '1.1.0-beta.1')).toBe(1);
    expect(compareVersions('1.1.0-beta.1', '1.1.0')).toBe(-1);
    expect(compareVersions('1.1.0-beta.2', '1.1.0-beta.10')).toBe(-1);
    expect(compareVersions('1.1.0-alpha', '1.1.0-beta')).toBe(-1);
    expect(compareVersions('1.1.0-beta', '1.1.0-alpha')).toBe(1);
    expect(compareVersions('1.1.0-1', '1.1.0-alpha')).toBe(-1);
    expect(compareVersions('1.1.0-alpha', '1.1.0-1')).toBe(1);
    expect(compareVersions('1.1.0-beta', '1.1.0-beta.1')).toBe(-1);
    expect(compareVersions('1.1.0-rc.1', '1.1.0-rc.1')).toBe(0);
  });

  it('throws an UpdateError for invalid versions', () => {
    expect(() => compareVersions('1.0', '1.0.0')).toThrow(UpdateError);
    expect(() => compareVersions('1.0.0', 'latest')).toThrow('"latest" is not a valid version number.');
  });
});

function environment(overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return {
    platform: 'win32',
    arch: 'x64',
    isPackaged: true,
    runningUnderArm64Translation: false,
    env: {},
    execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\markdownplusplus\\MarkDown++.exe',
    fileExists: (path) =>
      path === 'C:\\Users\\me\\AppData\\Local\\Programs\\markdownplusplus\\Uninstall MarkDown++.exe',
    ...overrides,
  };
}

describe('detectInstallTarget', () => {
  it('uses the setup of the matching architecture for a Windows installation', () => {
    expect(detectInstallTarget(environment())).toEqual({
      mode: 'installer',
      assetSuffix: 'win-x64-setup.exe',
    });
    expect(detectInstallTarget(environment({ arch: 'arm64' }))).toEqual({
      mode: 'installer',
      assetSuffix: 'win-arm64-setup.exe',
    });
    expect(detectInstallTarget(environment({ runningUnderArm64Translation: true }))).toEqual({
      mode: 'installer',
      assetSuffix: 'win-arm64-setup.exe',
    });
  });

  it('cannot update the Windows portable build or a copy without uninstaller in place', () => {
    expect(detectInstallTarget(environment({ env: { PORTABLE_EXECUTABLE_DIR: 'D:\\Tools' } }))).toEqual({
      mode: 'manual',
    });
    expect(detectInstallTarget(environment({ env: { PORTABLE_EXECUTABLE_DIR: '  ' } })).mode).toBe(
      'installer',
    );
    expect(detectInstallTarget(environment({ fileExists: () => false }))).toEqual({ mode: 'manual' });
  });

  it('uses the disk image of the matching architecture on macOS', () => {
    const mac = {
      platform: 'darwin',
      execPath: '/Applications/MarkDown++.app/Contents/MacOS/MarkDown++',
    } as const;
    expect(detectInstallTarget(environment({ ...mac, arch: 'arm64' }))).toEqual({
      mode: 'disk-image',
      assetSuffix: 'mac-arm64.dmg',
    });
    expect(detectInstallTarget(environment(mac))).toEqual({ mode: 'disk-image', assetSuffix: 'mac-x64.dmg' });
    expect(detectInstallTarget(environment({ ...mac, runningUnderArm64Translation: true }))).toEqual({
      mode: 'disk-image',
      assetSuffix: 'mac-arm64.dmg',
    });
  });

  it('replaces the AppImage on Linux and leaves packages to the package manager', () => {
    const linux = { platform: 'linux', execPath: '/tmp/.mount_abc/markdownplusplus' } as const;
    const mount = { APPDIR: '/tmp/.mount_abc' };
    expect(
      detectInstallTarget(
        environment({ ...linux, env: { ...mount, APPIMAGE: '/home/me/Apps/MarkDown.AppImage' } }),
      ),
    ).toEqual({
      mode: 'appimage',
      assetSuffix: 'linux-x86_64.AppImage',
      appImagePath: '/home/me/Apps/MarkDown.AppImage',
    });
    expect(
      detectInstallTarget(
        environment({
          ...linux,
          arch: 'arm64',
          env: { APPDIR: '/tmp/.mount_abc/', APPIMAGE: '/opt/MarkDown.AppImage' },
        }),
      ),
    ).toEqual({
      mode: 'appimage',
      assetSuffix: 'linux-arm64.AppImage',
      appImagePath: '/opt/MarkDown.AppImage',
    });
    expect(
      detectInstallTarget(environment({ ...linux, env: { ...mount, APPIMAGE: 'relative.AppImage' } })),
    ).toEqual({
      mode: 'manual',
    });
    expect(
      detectInstallTarget(environment({ ...linux, execPath: '/usr/lib/markdownplusplus/markdownplusplus' })),
    ).toEqual({ mode: 'manual' });
  });

  it('never replaces a foreign AppImage whose APPIMAGE/APPDIR a deb or tar.gz copy inherited', () => {
    // A deb/tar.gz MarkDown++ started from a terminal inside another AppImage app (e.g.
    // Cursor) inherits that app's APPIMAGE and APPDIR; its own executable lies elsewhere.
    const inherited = { APPIMAGE: '/home/me/Apps/Cursor.AppImage', APPDIR: '/tmp/.mount_Cursor1' };
    const linux = { platform: 'linux', env: inherited } as const;
    for (const execPath of [
      '/usr/lib/markdownplusplus/markdownplusplus',
      '/home/me/markdownplusplus-1.1.0/markdownplusplus',
      // A sibling mount whose name merely starts with APPDIR.
      '/tmp/.mount_Cursor1x/markdownplusplus',
      '/tmp/.mount_Cursor1',
    ]) {
      expect(detectInstallTarget(environment({ ...linux, execPath }))).toEqual({ mode: 'manual' });
    }
    // APPIMAGE alone (without the mount of our own executable) is not trusted either.
    expect(
      detectInstallTarget(
        environment({
          platform: 'linux',
          execPath: '/tmp/.mount_abc/markdownplusplus',
          env: { APPIMAGE: '/home/me/Apps/MarkDown.AppImage' },
        }),
      ),
    ).toEqual({ mode: 'manual' });
    expect(
      detectInstallTarget(
        environment({
          platform: 'linux',
          execPath: '/tmp/.mount_abc/markdownplusplus',
          env: { APPIMAGE: '/home/me/Apps/MarkDown.AppImage', APPDIR: 'relative/.mount_abc' },
        }),
      ),
    ).toEqual({ mode: 'manual' });
  });

  it('never updates development builds, unknown architectures or other platforms in place', () => {
    expect(detectInstallTarget(environment({ isPackaged: false }))).toEqual({ mode: 'manual' });
    expect(detectInstallTarget(environment({ arch: 'ia32' }))).toEqual({ mode: 'manual' });
    expect(detectInstallTarget(environment({ arch: 'arm' }))).toEqual({ mode: 'manual' });
    expect(detectInstallTarget(environment({ platform: 'freebsd' }))).toEqual({ mode: 'manual' });
  });
});

describe('assetNameFor', () => {
  it('follows the artifact names of electron-builder.yml', () => {
    expect(assetNameFor({ mode: 'installer', assetSuffix: 'win-x64-setup.exe' }, '1.0.5')).toBe(
      'MarkDownPlusPlus-1.0.5-win-x64-setup.exe',
    );
    expect(
      assetNameFor({ mode: 'appimage', assetSuffix: 'linux-x86_64.AppImage', appImagePath: '/a' }, '2.0.0'),
    ).toBe('MarkDownPlusPlus-2.0.0-linux-x86_64.AppImage');
  });
});

describe('URL allowlists', () => {
  it('allows downloads only over https from GitHub and its release storage hosts', () => {
    for (const url of [
      `${DOWNLOAD}/v1.0.5/x.exe`,
      'https://release-assets.githubusercontent.com/github-production-release-asset/1?sig=abc',
      'https://objects.githubusercontent.com/github-production-release-asset-2e65be/1',
    ]) {
      expect(isAllowedDownloadUrl(new URL(url)), url).toBe(true);
    }
    for (const url of [
      'http://github.com/Amadudl/MarkDownPlusPlus/releases/download/v1/x.exe',
      'https://evil.example/x.exe',
      'https://github.com.evil.example/x.exe',
      'https://user:pass@github.com/x.exe',
      'https://github.com:8443/x.exe',
      'https://raw.githubusercontent.com/x.exe',
      'file:///C:/x.exe',
    ]) {
      expect(isAllowedDownloadUrl(new URL(url)), url).toBe(false);
    }
  });

  it('accepts only release pages of this repository', () => {
    expect(isReleasePageUrl('https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v1.0.5')).toBe(true);
    expect(isReleasePageUrl(RELEASES_PAGE_URL)).toBe(true);
    expect(isReleasePageUrl('https://github.com/someone/else/releases/tag/v1')).toBe(false);
    expect(isReleasePageUrl('https://evil.example/Amadudl/MarkDownPlusPlus/releases/tag/v1')).toBe(false);
    expect(isReleasePageUrl('not a url')).toBe(false);
  });

  it('accepts exactly the github.com download URL of a release file', () => {
    const name = 'MarkDownPlusPlus-1.0.5-win-x64-setup.exe';
    expect(isReleaseDownloadUrl(`${DOWNLOAD}/v1.0.5/${name}`, 'v1.0.5', name)).toBe(true);
    expect(isReleaseDownloadUrl(`${DOWNLOAD}/v1.0.4/${name}`, 'v1.0.5', name)).toBe(false);
    expect(isReleaseDownloadUrl(`${DOWNLOAD}/v1.0.5/other.exe`, 'v1.0.5', name)).toBe(false);
    expect(isReleaseDownloadUrl(`${DOWNLOAD}/v1.0.5/${name}?x=1`, 'v1.0.5', name)).toBe(false);
    expect(isReleaseDownloadUrl(`${DOWNLOAD}/v1.0.5/${name}#x`, 'v1.0.5', name)).toBe(false);
    expect(
      isReleaseDownloadUrl(`https://github.com/other/repo/releases/download/v1.0.5/${name}`, 'v1.0.5', name),
    ).toBe(false);
    expect(isReleaseDownloadUrl('::', 'v1.0.5', name)).toBe(false);
  });

  it('points the check at the latest-release endpoint of the repository', () => {
    expect(LATEST_RELEASE_API_URL).toBe(
      'https://api.github.com/repos/Amadudl/MarkDownPlusPlus/releases/latest',
    );
  });
});

describe('parseRelease', () => {
  const names = ['MarkDownPlusPlus-1.1.0-win-x64-setup.exe', CHECKSUMS_FILE_NAME];

  it('keeps the fields the update needs and only assets with valid download URLs', () => {
    const json = githubRelease('1.1.0', names);
    (json.assets as Record<string, unknown>[]).push(
      { name: 'evil.exe', size: 10, browser_download_url: 'https://evil.example/evil.exe' },
      { name: 'empty.exe', size: 0, browser_download_url: `${DOWNLOAD}/v1.1.0/empty.exe` },
      { name: 'huge.exe', size: MAX_ASSET_BYTES + 1, browser_download_url: `${DOWNLOAD}/v1.1.0/huge.exe` },
    );
    const release = parseRelease(json);
    expect(release).toMatchObject({
      version: '1.1.0',
      tag: 'v1.1.0',
      name: 'MarkDown++ 1.1.0',
      pageUrl: 'https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v1.1.0',
      publishedAt: '2026-11-01T10:00:00Z',
    });
    expect([...(release?.assets.keys() ?? [])]).toEqual(names);
    expect(release?.assets.get(names[0] ?? '')).toEqual({
      name: names[0],
      size: 100_000_000,
      url: `${DOWNLOAD}/v1.1.0/${names[0] ?? ''}`,
    });
  });

  it('fills in a missing title and publication date', () => {
    const release = parseRelease({ ...githubRelease('1.1.0'), name: '  ', published_at: null });
    expect(release).toMatchObject({ name: 'MarkDown++ 1.1.0', publishedAt: null });
    expect(parseRelease({ ...githubRelease('1.2.0'), name: undefined })?.name).toBe('MarkDown++ 1.2.0');
  });

  it('ignores drafts and pre-releases', () => {
    expect(parseRelease({ ...githubRelease(), draft: true })).toBeNull();
    expect(parseRelease({ ...githubRelease(), prerelease: true })).toBeNull();
  });

  it('rejects data that does not look like a release of this project', () => {
    expect(() => parseRelease(null)).toThrow(UpdateError);
    expect(() => parseRelease({ tag_name: 'v1.0.0' })).toThrow('unexpected format');
    expect(() => parseRelease({ ...githubRelease(), draft: 'no' })).toThrow('unexpected format');
    expect(() => parseRelease({ ...githubRelease(), tag_name: 'nightly' })).toThrow('unexpected version tag');
    expect(() => parseRelease({ ...githubRelease(), tag_name: 'v1.1.0-beta.1' })).toThrow(
      'unexpected version tag',
    );
    expect(() => parseRelease({ ...githubRelease(), html_url: 'https://evil.example/' })).toThrow(
      'unexpected web page',
    );
  });
});

describe('planUpdate', () => {
  const installer = { mode: 'installer', assetSuffix: 'win-x64-setup.exe' } as const;

  it('picks the package and the checksum file', () => {
    const release = parseRelease(
      githubRelease('1.1.0', ['MarkDownPlusPlus-1.1.0-win-x64-setup.exe', CHECKSUMS_FILE_NAME]),
    );
    if (release === null) throw new Error('release expected');
    const plan = planUpdate(installer, release);
    expect(plan.mode).toBe('installer');
    expect(plan.asset?.name).toBe('MarkDownPlusPlus-1.1.0-win-x64-setup.exe');
    expect(plan.checksums?.name).toBe(CHECKSUMS_FILE_NAME);
  });

  it('falls back to the release page when a file is missing or unusable', () => {
    const withoutSums = parseRelease(githubRelease('1.1.0', ['MarkDownPlusPlus-1.1.0-win-x64-setup.exe']));
    const withoutPackage = parseRelease(githubRelease('1.1.0', [CHECKSUMS_FILE_NAME]));
    const hugeSums = parseRelease(githubRelease('1.1.0', ['MarkDownPlusPlus-1.1.0-win-x64-setup.exe']));
    if (withoutSums === null || withoutPackage === null || hugeSums === null)
      throw new Error('release expected');
    (hugeSums.assets as Map<string, { name: string; size: number; url: string }>).set(CHECKSUMS_FILE_NAME, {
      name: CHECKSUMS_FILE_NAME,
      size: MAX_CHECKSUMS_BYTES + 1,
      url: `${DOWNLOAD}/v1.1.0/${CHECKSUMS_FILE_NAME}`,
    });
    const manual = { mode: 'manual', asset: null, checksums: null };
    expect(planUpdate(installer, withoutSums)).toEqual(manual);
    expect(planUpdate(installer, withoutPackage)).toEqual(manual);
    expect(planUpdate(installer, hugeSums)).toEqual(manual);
    expect(planUpdate({ mode: 'manual' }, withoutSums)).toEqual(manual);
  });
});

describe('parseChecksums', () => {
  const a = 'a'.repeat(64);
  const b = 'B'.repeat(64);

  it('reads sha256sum output in text and binary mode', () => {
    const sums = parseChecksums(`${a}  first.exe\r\n${b} *second.dmg\n\nnot a checksum line\n`);
    expect([...sums]).toEqual([
      ['first.exe', a],
      ['second.dmg', 'b'.repeat(64)],
    ]);
  });

  it('drops files listed with conflicting checksums', () => {
    const sums = parseChecksums(
      `${a}  same.exe\n${a}  same.exe\n${a}  twice.exe\n${'c'.repeat(64)}  twice.exe\n`,
    );
    expect(sums.get('same.exe')).toBe(a);
    expect(sums.has('twice.exe')).toBe(false);
  });

  it('ignores malformed lines', () => {
    expect(
      parseChecksums(`${'a'.repeat(63)}  short.exe\n${'g'.repeat(64)}  hex.exe\n${a}nospace.exe`).size,
    ).toBe(0);
  });
});
