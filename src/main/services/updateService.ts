/**
 * The in-app update function: asks GitHub for the latest release, downloads the
 * package of the running installation, verifies it against the release's
 * `SHA256SUMS.txt` and installs it. Only files whose SHA-256 checksum matched
 * are ever opened or executed; everything else is deleted.
 */
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, openSync, readSync, renameSync, rmSync } from 'node:fs';
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

/** The release check aborts when GitHub sends nothing for this long (idle timeout). */
export const CHECK_TIMEOUT_MS = 10_000;
/** Overall time limit of the release check and of the `SHA256SUMS.txt` download. */
export const CHECK_DEADLINE_MS = 30_000;
/** A download aborts when no data arrived for this long. */
export const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;
/** The download is paused while more than this many received bytes wait to be written. */
export const WRITE_BACKLOG_LIMIT_BYTES = 4 * 1024 * 1024;
/** Read size when hashing a file from disk. */
const HASH_READ_BYTES = 1024 * 1024;

/**
 * Arguments of the Windows installer: `/S` installs silently into the existing
 * installation folder (per user, or per machine after a UAC prompt), `--updated`
 * keeps the shortcuts and waits for the old app to exit, `--force-run` starts the
 * new version afterwards.
 */
export const WINDOWS_INSTALLER_ARGS: readonly string[] = ['--updated', '/S', '--force-run'];

/**
 * Exact names of the files the updater downloads:
 * `tmp_<16 hex>_MarkDownPlusPlus-<version>-<package>` for every package it can install.
 */
const DOWNLOAD_FILE_PATTERN =
  /^tmp_[0-9a-f]{16}_MarkDownPlusPlus-\d+\.\d+\.\d+-(?:win-(?:x64|arm64)-setup\.exe|mac-(?:x64|arm64)\.dmg|linux-(?:x86_64|arm64)\.AppImage)$/;

/** SHA-256 (lower-case hex) of a file, read from disk. */
async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(HASH_READ_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

/**
 * SHA-256 of a file, read synchronously. Used on `will-quit`, right before the
 * verified file is executed or moved, where no asynchronous work can run.
 */
function hashFileSync(path: string): string {
  const hash = createHash('sha256');
  const descriptor = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(HASH_READ_BYTES);
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest('hex');
}

/**
 * Writes chunks to a file in order without making the network callback wait.
 * Every chunk is written completely (a short write is continued), the first
 * write error is remembered (reported by the next write and by
 * {@link FileSink.close}), and {@link FileSink.write} reports when the backlog
 * of unwritten bytes exceeds `backlogLimit`, so the caller can pause the source.
 */
export class FileSink {
  private queue: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private backlog = 0;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly handle: FileHandle,
    private readonly backlogLimit: number = WRITE_BACKLOG_LIMIT_BYTES,
  ) {}

  /**
   * Queues `chunk`; throws the first write error that already happened.
   * @returns false when the backlog now exceeds the limit (pause the source until {@link drained}).
   */
  write(chunk: Buffer): boolean {
    if (this.failure !== null) throw this.failure;
    this.backlog += chunk.length;
    this.queue = this.queue
      .then(async () => {
        if (this.failure === null) await this.writeFully(chunk);
      })
      .catch((error: unknown) => {
        this.failure ??= error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        this.backlog -= chunk.length;
        if (this.backlog <= this.backlogLimit / 2) this.wakeWaiters();
      });
    return this.backlog <= this.backlogLimit;
  }

  /** Resolves once the backlog dropped to half the limit or less (immediately if it already is). */
  drained(): Promise<void> {
    if (this.backlog <= this.backlogLimit / 2) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Waits for all queued writes, closes the file and throws the first write error, if any. */
  async close(): Promise<void> {
    await this.queue;
    await this.handle.close();
    if (this.failure !== null) throw this.failure;
  }

  private async writeFully(chunk: Buffer): Promise<void> {
    let offset = 0;
    while (offset < chunk.length) {
      const { bytesWritten } = await this.handle.write(chunk, offset, chunk.length - offset);
      if (bytesWritten <= 0)
        throw new UpdateError('The update file could not be saved: the disk wrote no data.');
      offset += bytesWritten;
    }
  }

  private wakeWaiters(): void {
    for (const resolve of this.waiters.splice(0)) resolve();
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
  /** Creates a new download file (default: `open(path, 'wx', 0o600)`). */
  readonly openFile?: (path: string) => Promise<FileHandle>;
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
  /** The published checksum the file matched; checked again right before `run`. */
  readonly sha256: string;
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
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
  private readonly openFile: (path: string) => Promise<FileHandle>;

  constructor(private readonly options: UpdateServiceOptions) {
    this.defer = options.defer ?? ((callback) => void setTimeout(callback, 0));
    this.randomId = options.randomId ?? (() => randomBytes(8).toString('hex'));
    this.openFile = options.openFile ?? ((path) => open(path, 'wx', 0o600));
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
      deadlineMs: CHECK_DEADLINE_MS,
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
   * Windows installer, replace and relaunch the AppImage). Called on `will-quit`.
   * The verified file is hashed again right before it is used; a file that
   * changed or vanished since the verification is deleted and never used.
   * Failures are logged: the app is quitting and has no window left to show them.
   * @returns true if there was such work.
   */
  runPendingInstall(): boolean {
    const pending = this.pending;
    this.pending = null;
    if (pending === null) return false;
    let actual: string;
    try {
      actual = hashFileSync(pending.file);
    } catch (error) {
      console.error(`The update file ${pending.file} could not be read before installing: ${String(error)}`);
      return true;
    }
    if (actual !== pending.sha256) {
      console.error(`The update file ${pending.file} changed after it was verified and was deleted.`);
      this.discardSync(pending.file);
      return true;
    }
    try {
      pending.run();
    } catch (error) {
      console.error(`The update could not be installed: ${String(error)}`);
      this.discardSync(pending.file);
    }
    return true;
  }

  /**
   * Deletes verified setups and disk images that earlier runs left in the
   * download folder (an installer still running at the last quit, an opened
   * disk image). Only files matching the exact names of the updater's downloads
   * are touched. Called once at startup; failures are logged.
   */
  async removeLeftoverDownloads(): Promise<void> {
    try {
      await this.removeStaleDownloads(this.options.downloadDir);
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return;
      console.warn(`Could not clean up the update folder ${this.options.downloadDir}: ${String(error)}`);
    }
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
      await this.download(plan.asset, file);
      this.options.onProgress({ phase: 'verifying' });
      // Hashed from disk after the file was closed, so what is verified is what will run.
      if ((await hashFile(file)) !== expected) {
        throw new UpdateError(
          `The downloaded file ${plan.asset.name} does not match its published SHA-256 checksum and was deleted.`,
        );
      }
      return await this.installVerified(target, file, expected);
    } catch (error) {
      await this.discard(file);
      throw error;
    }
  }

  private async installVerified(
    target: Exclude<InstallTarget, { mode: 'manual' }>,
    file: string,
    sha256: string,
  ): Promise<UpdateInstallOutcome> {
    switch (target.mode) {
      case 'installer':
        this.pending = { run: () => this.options.spawnDetached(file, WINDOWS_INSTALLER_ARGS), file, sha256 };
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
          sha256,
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
      deadlineMs: CHECK_DEADLINE_MS,
      maxBytes: Math.min(checksums.size, MAX_CHECKSUMS_BYTES),
      isAllowedUrl: isAllowedDownloadUrl,
    });
    const checksum = parseChecksums(body.toString('utf8')).get(name);
    if (checksum === undefined) {
      throw new UpdateError(`${checksums.name} lists no checksum for ${name}, so it cannot be verified.`);
    }
    return checksum;
  }

  /**
   * Streams `asset` into `file`. The response is paused while the disk falls
   * more than {@link WRITE_BACKLOG_LIMIT_BYTES} behind, so memory stays bounded.
   */
  private async download(asset: ReleaseAsset, file: string): Promise<void> {
    const sink = new FileSink(await this.openFile(file));
    let received = 0;
    let paused = false;
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
        onData: (chunk, flow) => {
          if (!sink.write(chunk) && !paused) {
            paused = true;
            flow.pause();
            void sink.drained().then(() => {
              paused = false;
              flow.resume();
            });
          }
          received += chunk.length;
          report();
        },
      });
    } finally {
      await sink.close();
    }
    if (received !== asset.size) throw new UpdateError(`The download of ${asset.name} was incomplete.`);
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

  /** {@link discard} for `will-quit`, where asynchronous work would not finish. */
  private discardSync(file: string): void {
    try {
      rmSync(file, { force: true });
    } catch (error) {
      console.warn(`Could not delete the update download ${file}: ${String(error)}`);
    }
  }
}
