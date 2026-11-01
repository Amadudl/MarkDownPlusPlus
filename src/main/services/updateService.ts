/**
 * The in-app update function: asks GitHub for the latest release, downloads the
 * package of the running installation, verifies it against the release's
 * `SHA256SUMS.txt` and installs it. Only files whose SHA-256 checksum matched
 * are ever opened or executed; everything else is deleted.
 */
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, renameSync } from 'node:fs';
import { mkdir, open, readdir, rm, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { UpdateCheckResult, UpdateInfo, UpdateInstallOutcome, UpdateProgress } from '../../shared/types';
import { httpGetBuffer, type HttpGet } from './httpClient';
import {
  compareVersions,
  isAllowedDownloadUrl,
  MAX_CHECKSUMS_BYTES,
  MAX_RELEASE_JSON_BYTES,
  parseChecksums,
  parseRelease,
  planUpdate,
  UpdateError,
  type InstallTarget,
  type Release,
  type ReleaseAsset,
  type UpdatePlan,
} from './updateCore';

/** Time limit of the release check (no answer within this time aborts it). */
export const CHECK_TIMEOUT_MS = 10_000;
/** A download aborts when no data arrived for this long. */
export const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

/**
 * Arguments of the Windows installer: `/S` installs silently into the existing
 * installation folder (per user, or per machine after a UAC prompt), `--updated`
 * keeps the shortcuts and waits for the old app to exit, `--force-run` starts the
 * new version afterwards.
 */
export const WINDOWS_INSTALLER_ARGS: readonly string[] = ['--updated', '/S', '--force-run'];

/** Downloads in progress or left over by an earlier attempt (`tmp_<16 hex>_MarkDownPlusPlus-…`). */
const DOWNLOAD_FILE_PATTERN = /^tmp_[0-9a-f]{16}_MarkDownPlusPlus-/;

/**
 * Writes chunks to a file in order without making the network callback wait,
 * and remembers the first write error (reported by the next write and by
 * {@link FileSink.close}).
 */
export class FileSink {
  private queue: Promise<void> = Promise.resolve();
  private failure: Error | null = null;

  constructor(private readonly handle: FileHandle) {}

  /** Queues `chunk`; throws the first write error that already happened. */
  write(chunk: Buffer): void {
    if (this.failure !== null) throw this.failure;
    this.queue = this.queue
      .then(async () => {
        await this.handle.write(chunk);
      })
      .catch((error: unknown) => {
        this.failure ??= error instanceof Error ? error : new Error(String(error));
      });
  }

  /** Waits for all queued writes, closes the file and throws the first write error, if any. */
  async close(): Promise<void> {
    await this.queue;
    await this.handle.close();
    if (this.failure !== null) throw this.failure;
  }
}

/** Collaborators of {@link UpdateService}; injected so the service is testable without Electron. */
export interface UpdateServiceOptions {
  /** Version of the running app (`app.getVersion()`). */
  readonly currentVersion: string;
  readonly target: InstallTarget;
  readonly httpGet: HttpGet;
  /** Latest-release endpoint (only replaced by a loopback stub in development and E2E tests). */
  readonly apiUrl: string;
  /** Folder for downloaded installers and disk images (not used for the AppImage). */
  readonly downloadDir: string;
  readonly userAgent: string;
  /** Opens a file with its default application (`shell.openPath`); resolves with an error text or `''`. */
  readonly openPath: (path: string) => Promise<string>;
  /** Opens an allowlisted URL in the browser; resolves false if it was refused. */
  readonly openExternal: (url: string) => Promise<boolean>;
  /** Starts quitting the app through the normal close flow (unsaved changes are asked about). */
  readonly requestQuit: () => void;
  /** Schedules a start of `execPath` once the app has exited (`app.relaunch`). */
  readonly relaunch: (execPath: string) => void;
  /** Starts a program detached from the app. */
  readonly spawnDetached: (file: string, args: readonly string[]) => void;
  /** Receives download progress and the cancellation of a pending install. */
  readonly onProgress: (progress: UpdateProgress) => void;
  /** Runs a callback after the current IPC reply was sent. */
  readonly defer?: (callback: () => void) => void;
  /** Random hex id for download file names (16 hex digits). */
  readonly randomId?: () => string;
}

/** The result of the last successful check that found an update. */
interface KnownUpdate {
  readonly release: Release;
  readonly plan: UpdatePlan;
  readonly info: UpdateInfo;
}

/** Work left for the moment the app quits, and the verified download it uses. */
interface PendingInstall {
  readonly run: () => void;
  readonly file: string;
}

/** Shown when the app did not quit, so a pending install was dropped. */
export const CANCELLED_MESSAGE =
  'The update was not installed because MarkDown++ did not close. Check for updates again to retry.';

/** Checks for, downloads, verifies and installs updates (see the module documentation). */
export class UpdateService {
  private known: KnownUpdate | null = null;
  private installing = false;
  private pending: PendingInstall | null = null;
  private readonly defer: (callback: () => void) => void;
  private readonly randomId: () => string;

  constructor(private readonly options: UpdateServiceOptions) {
    this.defer = options.defer ?? ((callback) => void setTimeout(callback, 0));
    this.randomId = options.randomId ?? (() => randomBytes(8).toString('hex'));
  }

  /** True when an install waits for the app to quit. */
  get hasPendingInstall(): boolean {
    return this.pending !== null;
  }

  /**
   * Asks GitHub for the latest release and compares it with the running version.
   * Drafts and pre-releases are never offered.
   * @throws UpdateError with a user-facing message if the check fails.
   */
  async check(): Promise<UpdateCheckResult> {
    const apiOrigin = new URL(this.options.apiUrl).origin;
    const body = await httpGetBuffer(this.options.httpGet, this.options.apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': this.options.userAgent,
      },
      timeoutMs: CHECK_TIMEOUT_MS,
      maxBytes: MAX_RELEASE_JSON_BYTES,
      isAllowedUrl: (url) => url.origin === apiOrigin && url.username === '' && url.password === '',
    });
    let json: unknown;
    try {
      json = JSON.parse(body.toString('utf8'));
    } catch {
      throw new UpdateError('GitHub sent an invalid response.');
    }
    const release = parseRelease(json);
    const currentVersion = this.options.currentVersion;
    if (release === null || compareVersions(release.version, currentVersion) <= 0) {
      this.known = null;
      return { status: 'up-to-date', currentVersion, latestVersion: release?.version ?? currentVersion };
    }
    const plan = planUpdate(this.options.target, release);
    const info: UpdateInfo = {
      version: release.version,
      currentVersion,
      releaseName: release.name,
      releaseUrl: release.pageUrl,
      publishedAt: release.publishedAt,
      installMode: plan.mode,
      downloadSize: plan.asset?.size ?? null,
    };
    this.known = { release, plan, info };
    return { status: 'available', update: info };
  }

  /**
   * Installs the update found by the last {@link check}. `version` must match it,
   * so the user always gets the version they were shown.
   * @throws UpdateError (or a file system error) if the update cannot be installed.
   */
  async install(version: string): Promise<UpdateInstallOutcome> {
    if (this.installing) throw new UpdateError('An update is already being downloaded.');
    if (this.pending !== null) throw new UpdateError('The update is installed when MarkDown++ closes.');
    const known = this.known;
    if (known?.info.version !== version) {
      throw new UpdateError('This update is no longer current. Check for updates again.');
    }
    this.installing = true;
    try {
      return await this.installKnown(known);
    } finally {
      this.installing = false;
    }
  }

  /**
   * Runs the work an install left for the moment the app quits (start the
   * Windows installer, relaunch the replaced AppImage). Called on `will-quit`.
   * @returns true if there was such work.
   */
  runPendingInstall(): boolean {
    const pending = this.pending;
    this.pending = null;
    if (pending === null) return false;
    pending.run();
    return true;
  }

  /**
   * Drops a pending install because the app did not quit (the user kept a
   * document open): nothing is installed and the verified download is deleted.
   */
  cancelPendingInstall(): void {
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;
    void this.discard(pending.file);
    this.options.onProgress({ phase: 'cancelled', message: CANCELLED_MESSAGE });
  }

  private async installKnown(known: KnownUpdate): Promise<UpdateInstallOutcome> {
    const { plan, release } = known;
    const target = this.options.target;
    if (
      plan.mode === 'manual' ||
      plan.asset === null ||
      plan.checksums === null ||
      target.mode === 'manual'
    ) {
      if (!(await this.options.openExternal(release.pageUrl))) {
        throw new UpdateError('The release page could not be opened.');
      }
      return 'release-page-opened';
    }
    const expected = await this.fetchChecksum(plan.checksums, plan.asset.name);
    const directory = target.mode === 'appimage' ? dirname(target.appImagePath) : this.options.downloadDir;
    await mkdir(directory, { recursive: true });
    await this.removeStaleDownloads(directory);
    const file = join(directory, `tmp_${this.randomId()}_${plan.asset.name}`);
    try {
      const actual = await this.download(plan.asset, file);
      this.options.onProgress({ phase: 'verifying' });
      if (actual !== expected) {
        throw new UpdateError(
          `The downloaded file ${plan.asset.name} does not match its published SHA-256 checksum and was deleted.`,
        );
      }
      return await this.installVerified(target, file);
    } catch (error) {
      await this.discard(file);
      throw error;
    }
  }

  private async installVerified(
    target: Exclude<InstallTarget, { mode: 'manual' }>,
    file: string,
  ): Promise<UpdateInstallOutcome> {
    switch (target.mode) {
      case 'installer':
        this.pending = { run: () => this.options.spawnDetached(file, WINDOWS_INSTALLER_ARGS), file };
        this.defer(this.options.requestQuit);
        return 'restarting';
      case 'disk-image': {
        const error = await this.options.openPath(file);
        if (error !== '') throw new UpdateError(`The disk image could not be opened: ${error}`);
        return 'disk-image-opened';
      }
      case 'appimage': {
        // Replaced only once every window has closed, so keeping a document open
        // aborts the update. Same folder as the AppImage: the rename is atomic.
        this.pending = {
          run: () => {
            chmodSync(file, 0o755);
            renameSync(file, target.appImagePath);
            this.options.relaunch(target.appImagePath);
          },
          file,
        };
        this.defer(this.options.requestQuit);
        return 'restarting';
      }
    }
  }

  /** Downloads `SHA256SUMS.txt` and returns the checksum of `name`. */
  private async fetchChecksum(checksums: ReleaseAsset, name: string): Promise<string> {
    const body = await httpGetBuffer(this.options.httpGet, checksums.url, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': this.options.userAgent },
      timeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
      maxBytes: Math.min(checksums.size, MAX_CHECKSUMS_BYTES),
      isAllowedUrl: isAllowedDownloadUrl,
    });
    const checksum = parseChecksums(body.toString('utf8')).get(name);
    if (checksum === undefined) {
      throw new UpdateError(`${checksums.name} lists no checksum for ${name}, so it cannot be verified.`);
    }
    return checksum;
  }

  /** Streams `asset` into `file` and returns its SHA-256 checksum (lower-case hex). */
  private async download(asset: ReleaseAsset, file: string): Promise<string> {
    const hash = createHash('sha256');
    const sink = new FileSink(await open(file, 'wx', 0o600));
    let received = 0;
    let reportedPercent = -1;
    const report = (): void => {
      const percent = Math.floor((received * 100) / asset.size);
      if (percent === reportedPercent) return;
      reportedPercent = percent;
      this.options.onProgress({ phase: 'downloading', receivedBytes: received, totalBytes: asset.size });
    };
    report();
    try {
      await this.options.httpGet(asset.url, {
        headers: { Accept: 'application/octet-stream', 'User-Agent': this.options.userAgent },
        timeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
        maxBytes: asset.size,
        isAllowedUrl: isAllowedDownloadUrl,
        onData: (chunk) => {
          sink.write(chunk);
          hash.update(chunk);
          received += chunk.length;
          report();
        },
      });
    } finally {
      await sink.close();
    }
    if (received !== asset.size) throw new UpdateError(`The download of ${asset.name} was incomplete.`);
    return hash.digest('hex');
  }

  /** Deletes downloads left over by earlier attempts (only files named like our downloads). */
  private async removeStaleDownloads(directory: string): Promise<void> {
    const names = await readdir(directory);
    for (const name of names.filter((entry) => DOWNLOAD_FILE_PATTERN.test(entry))) {
      await this.discard(join(directory, name));
    }
  }

  /** Deletes a download; a failure only costs disk space, so it is logged instead of thrown. */
  private async discard(file: string): Promise<void> {
    try {
      await rm(file, { force: true });
    } catch (error) {
      console.warn(`Could not delete the update download ${file}: ${String(error)}`);
    }
  }
}
