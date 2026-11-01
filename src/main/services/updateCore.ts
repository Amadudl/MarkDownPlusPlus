/**
 * Pure building blocks of the in-app update function: version comparison,
 * validation of the GitHub release data, the choice of the download for the
 * running installation, URL allowlists and the `SHA256SUMS.txt` parser. No
 * Electron, network or file system access here, so every rule is unit-tested.
 */
import { posix, win32 } from 'node:path';
import { z } from 'zod';
import type { UpdateInstallMode } from '../../shared/types';

/** GitHub repository that publishes the releases. */
export const UPDATE_REPOSITORY = 'Amadudl/MarkDownPlusPlus';
/** REST endpoint of the latest published release (drafts and pre-releases are never returned). */
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
/** Release page opened when the app cannot update itself. */
export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPOSITORY}/releases/latest`;
/** Name of the checksum file the release workflow attaches to every release. */
export const CHECKSUMS_FILE_NAME = 'SHA256SUMS.txt';
/** Prefix of every packaged file (`artifactName` in electron-builder.yml). */
export const ASSET_PREFIX = 'MarkDownPlusPlus';
/** File name of the NSIS uninstaller, which exists only in an installed (not portable) copy. */
export const WINDOWS_UNINSTALLER_NAME = 'Uninstall MarkDown++.exe';

/** Largest package the app downloads (the 1.0.5 packages are 90 to 225 MB). */
export const MAX_ASSET_BYTES = 600 * 1024 * 1024;
/** Largest `SHA256SUMS.txt` accepted. */
export const MAX_CHECKSUMS_BYTES = 64 * 1024;
/** Largest release JSON accepted from the API. */
export const MAX_RELEASE_JSON_BYTES = 2 * 1024 * 1024;

/**
 * Hosts a release download may be served from: the download URL itself
 * (github.com) and the storage hosts GitHub redirects release assets to
 * (`release-assets.githubusercontent.com` since 2025, `objects.githubusercontent.com`
 * before). Everything else is refused.
 */
export const DOWNLOAD_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

/** An update failure with a message written for the user. */
export class UpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateError';
  }
}

/** A parsed `major.minor.patch[-prerelease]` version. */
export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Pre-release identifiers (`beta.1` → `['beta', '1']`), empty for a final release. */
  readonly prerelease: readonly string[];
}

const VERSION_PATTERN = /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z.-]{1,64}))?$/;

/** Parses a semantic version (a leading `v` is accepted, build metadata is not); `null` if invalid. */
export function parseVersion(value: string): Version | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (match === null) return null;
  const [, major = '0', minor = '0', patch = '0', prerelease] = match;
  const identifiers = prerelease === undefined ? [] : prerelease.split('.');
  if (identifiers.some((identifier) => identifier === '')) return null;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease: identifiers };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Math.sign(Number(left) - Number(right));
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  // A final release ranks above any of its pre-releases (1.1.0 > 1.1.0-beta.1).
  if (left.length === 0 || right.length === 0) return Math.sign(right.length - left.length);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    // Both indexes are in range (index < both lengths).
    const order = compareIdentifiers(String(left[index]), String(right[index]));
    if (order !== 0) return order;
  }
  return Math.sign(left.length - right.length);
}

/**
 * Orders two versions by Semantic Versioning precedence.
 * @returns a negative number if `left` is older, 0 if equal, a positive number if newer.
 * @throws UpdateError if either is not a valid version.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === null || b === null) {
    throw new UpdateError(`"${a === null ? left : right}" is not a valid version number.`);
  }
  return (
    Math.sign(a.major - b.major) ||
    Math.sign(a.minor - b.minor) ||
    Math.sign(a.patch - b.patch) ||
    comparePrerelease(a.prerelease, b.prerelease)
  );
}

/** How the running copy of the app is updated, and which release file it needs. */
export type InstallTarget =
  | { readonly mode: 'installer'; readonly assetSuffix: string }
  | { readonly mode: 'disk-image'; readonly assetSuffix: string }
  | { readonly mode: 'appimage'; readonly assetSuffix: string; readonly appImagePath: string }
  | { readonly mode: 'manual' };

/** Facts about the running copy that decide its {@link InstallTarget}; injectable for tests. */
export interface InstallEnvironment {
  readonly platform: NodeJS.Platform;
  /** `process.arch`. */
  readonly arch: string;
  readonly isPackaged: boolean;
  /** `app.runningUnderARM64Translation`: an x64 build emulated on an Arm64 machine. */
  readonly runningUnderArm64Translation: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** `process.execPath`. */
  readonly execPath: string;
  readonly fileExists: (path: string) => boolean;
}

function nonEmpty(value: string | undefined): string | null {
  return value !== undefined && value.trim() !== '' ? value : null;
}

/**
 * Decides how the running copy can be updated:
 * - development builds, unknown architectures, the Windows portable build
 *   (`PORTABLE_EXECUTABLE_DIR`), Linux packages other than the AppImage and every
 *   other platform → `manual` (open the release page);
 * - a Windows NSIS installation (its uninstaller lies next to the executable) →
 *   `win-<arch>-setup.exe`;
 * - macOS → `mac-<arch>.dmg`;
 * - a Linux AppImage (`APPIMAGE`) → `linux-<x86_64|arm64>.AppImage`.
 * An x64 build running under Arm64 emulation switches to the native Arm64 build.
 */
export function detectInstallTarget(environment: InstallEnvironment): InstallTarget {
  if (!environment.isPackaged) return { mode: 'manual' };
  const arch =
    environment.arch === 'arm64' || (environment.arch === 'x64' && environment.runningUnderArm64Translation)
      ? 'arm64'
      : environment.arch === 'x64'
        ? 'x64'
        : null;
  if (arch === null) return { mode: 'manual' };
  switch (environment.platform) {
    case 'win32': {
      if (nonEmpty(environment.env.PORTABLE_EXECUTABLE_DIR) !== null) return { mode: 'manual' };
      const uninstaller = win32.join(win32.dirname(environment.execPath), WINDOWS_UNINSTALLER_NAME);
      return environment.fileExists(uninstaller)
        ? { mode: 'installer', assetSuffix: `win-${arch}-setup.exe` }
        : { mode: 'manual' };
    }
    case 'darwin':
      return { mode: 'disk-image', assetSuffix: `mac-${arch}.dmg` };
    case 'linux': {
      const appImagePath = nonEmpty(environment.env.APPIMAGE);
      if (appImagePath === null || !posix.isAbsolute(appImagePath)) return { mode: 'manual' };
      return {
        mode: 'appimage',
        assetSuffix: `linux-${arch === 'x64' ? 'x86_64' : 'arm64'}.AppImage`,
        appImagePath,
      };
    }
    default:
      return { mode: 'manual' };
  }
}

/** File name of the package `target` needs for `version`, e.g. `MarkDownPlusPlus-1.1.0-win-x64-setup.exe`. */
export function assetNameFor(target: Exclude<InstallTarget, { mode: 'manual' }>, version: string): string {
  return `${ASSET_PREFIX}-${version}-${target.assetSuffix}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** True for an `https:` URL without credentials or an explicit port whose host is in `hosts`. */
export function isAllowedHttpsUrl(url: URL, hosts: ReadonlySet<string>): boolean {
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    hosts.has(url.hostname)
  );
}

/** True if a release download may be requested from (or redirected to) `url`. */
export function isAllowedDownloadUrl(url: URL): boolean {
  return isAllowedHttpsUrl(url, DOWNLOAD_HOSTS);
}

const GITHUB_HOST: ReadonlySet<string> = new Set(['github.com']);

/** True if `value` is a page of this repository's releases on github.com. */
export function isReleasePageUrl(value: string): boolean {
  const url = parseUrl(value);
  return (
    url !== null &&
    isAllowedHttpsUrl(url, GITHUB_HOST) &&
    url.pathname.startsWith(`/${UPDATE_REPOSITORY}/releases/`)
  );
}

/** True if `value` is exactly the github.com download URL of `name` in the release `tag`. */
export function isReleaseDownloadUrl(value: string, tag: string, name: string): boolean {
  const url = parseUrl(value);
  return (
    url !== null &&
    isAllowedHttpsUrl(url, GITHUB_HOST) &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname ===
      `/${UPDATE_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`
  );
}

/** A downloadable file of a release. */
export interface ReleaseAsset {
  readonly name: string;
  readonly size: number;
  /** Validated github.com download URL (see {@link isReleaseDownloadUrl}). */
  readonly url: string;
}

/** The fields of a published GitHub release the update function uses. */
export interface Release {
  readonly version: string;
  readonly tag: string;
  readonly name: string;
  readonly pageUrl: string;
  readonly publishedAt: string | null;
  /** Assets with a valid download URL and an acceptable size, by file name. */
  readonly assets: ReadonlyMap<string, ReleaseAsset>;
}

/** Schema of the subset of the GitHub "release" object the app reads; other fields are ignored. */
export const githubReleaseSchema = z.object({
  tag_name: z.string().min(1).max(64),
  name: z.string().max(256).nullish(),
  html_url: z.string().max(2048),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().max(64).nullish(),
  assets: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        size: z.number().int().min(0),
        browser_download_url: z.string().max(2048),
      }),
    )
    .max(500),
});

/**
 * Validates the JSON of the latest-release endpoint.
 * @returns the release, or `null` for a draft or pre-release (never offered as an update).
 * @throws UpdateError if the data does not look like a release of this project.
 */
export function parseRelease(json: unknown): Release | null {
  const parsed = githubReleaseSchema.safeParse(json);
  if (!parsed.success) throw new UpdateError('GitHub sent release data in an unexpected format.');
  const release = parsed.data;
  if (release.draft || release.prerelease) return null;
  const version = parseVersion(release.tag_name);
  if (version === null || version.prerelease.length > 0) {
    throw new UpdateError(`The latest release has an unexpected version tag ("${release.tag_name}").`);
  }
  if (!isReleasePageUrl(release.html_url)) {
    throw new UpdateError('The latest release points to an unexpected web page.');
  }
  const assets = new Map<string, ReleaseAsset>();
  for (const asset of release.assets) {
    const usable =
      asset.size > 0 &&
      asset.size <= MAX_ASSET_BYTES &&
      isReleaseDownloadUrl(asset.browser_download_url, release.tag_name, asset.name);
    if (usable)
      assets.set(asset.name, { name: asset.name, size: asset.size, url: asset.browser_download_url });
  }
  const plain = `${version.major}.${version.minor}.${version.patch}`;
  const title = release.name?.trim() ?? '';
  return {
    version: plain,
    tag: release.tag_name,
    name: title === '' ? `MarkDown++ ${plain}` : title,
    pageUrl: release.html_url,
    publishedAt: release.published_at ?? null,
    assets,
  };
}

/** The files to download for `target` from `release`, or `null` when it can only be updated manually. */
export interface UpdatePlan {
  readonly mode: UpdateInstallMode;
  readonly asset: ReleaseAsset | null;
  readonly checksums: ReleaseAsset | null;
}

/**
 * Picks the package for `target` and the release's checksum file. Falls back to
 * `manual` when either is missing, so the user is never offered an install
 * that cannot be verified.
 */
export function planUpdate(target: InstallTarget, release: Release): UpdatePlan {
  if (target.mode === 'manual') return { mode: 'manual', asset: null, checksums: null };
  const asset = release.assets.get(assetNameFor(target, release.version));
  const checksums = release.assets.get(CHECKSUMS_FILE_NAME);
  if (asset === undefined || checksums === undefined || checksums.size > MAX_CHECKSUMS_BYTES) {
    return { mode: 'manual', asset: null, checksums: null };
  }
  return { mode: target.mode, asset, checksums };
}

const CHECKSUM_LINE = /^([0-9a-fA-F]{64}) [ *](.+)$/;

/**
 * Parses a `sha256sum` output (`<64 hex digits>  <file name>` per line, `*` marks
 * binary mode). Unparseable lines are ignored; a file listed twice with
 * different checksums is dropped, so it can never be verified.
 * @returns lower-case hex checksums by file name.
 */
export function parseChecksums(text: string): ReadonlyMap<string, string> {
  const checksums = new Map<string, string>();
  const conflicting = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = CHECKSUM_LINE.exec(line.trimEnd());
    if (match === null) continue;
    const [, hash = '', name = ''] = match;
    const digest = hash.toLowerCase();
    const known = checksums.get(name);
    if (known !== undefined && known !== digest) conflicting.add(name);
    checksums.set(name, digest);
  }
  for (const name of conflicting) checksums.delete(name);
  return checksums;
}
