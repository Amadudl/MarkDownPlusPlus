import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { chmod, open, realpath, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Options of {@link writeFileAtomic}. */
export interface AtomicWriteOptions {
  /**
   * File mode of the result. Defaults to the mode of the file being replaced, or
   * `0o666` (minus the process umask) for new files.
   */
  readonly mode?: number;
  /** Platform whose file system semantics apply; defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /**
   * Waits between rename attempts on Windows, where a file briefly held open by
   * an antivirus scanner, indexer or sync client cannot be replaced (`EPERM`,
   * `EBUSY`). Defaults to {@link WINDOWS_RENAME_RETRY_DELAYS_MS}.
   */
  readonly renameRetryDelaysMs?: readonly number[];
}

/** Default back-off between rename attempts on Windows (about 0.8 s in total). */
export const WINDOWS_RENAME_RETRY_DELAYS_MS: readonly number[] = [20, 50, 100, 200, 400];

/** What {@link writeFileAtomic} knows about the file it is about to replace. */
interface ResolvedTarget {
  /** The path written to (symlinks resolved). */
  readonly target: string;
  /** Permission bits of the existing file. */
  readonly mode: number | undefined;
  /** True if the target exists and is a regular file (so it can be overwritten in place). */
  readonly existingFile: boolean;
  /**
   * True if replacing the file with a new one would lose something: its other
   * hard links, or its owner (a file owned by another user, e.g. group-writable).
   */
  readonly preferInPlace: boolean;
}

function tempPathFor(target: string): string {
  return join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function isPermissionError(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'EACCES' || code === 'EPERM';
}

/** Errors of a rename over an existing file that an in-place write may still get past. */
function isReplaceError(error: unknown, platform: NodeJS.Platform): boolean {
  return isPermissionError(error) || (platform === 'win32' && errorCode(error) === 'EBUSY');
}

function ownedByAnotherUser(uid: number): boolean {
  const current = process.getuid?.();
  return current !== undefined && uid !== current;
}

async function resolveTarget(filePath: string): Promise<ResolvedTarget> {
  try {
    // Follow symlinks so that saving through a link updates the linked file
    // instead of replacing the link with a regular file.
    const target = await realpath(filePath);
    const info = await stat(target);
    const existingFile = info.isFile();
    return {
      target,
      mode: info.mode & 0o7777,
      existingFile,
      preferInPlace: existingFile && (info.nlink > 1 || ownedByAnotherUser(info.uid)),
    };
  } catch {
    return { target: filePath, mode: undefined, existingFile: false, preferInPlace: false };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function renameWithRetry(
  from: string,
  to: string,
  platform: NodeJS.Platform,
  delays: readonly number[],
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const wait = platform === 'win32' && isReplaceError(error, platform) ? delays[attempt] : undefined;
      if (wait === undefined) throw error;
      await delay(wait);
    }
  }
}

/**
 * Overwrites an existing file in place (truncate + write + fsync). Not atomic,
 * but it keeps the file's identity: owner, hard links, extended attributes and
 * ACLs, and it works in folders the user may not create files in.
 */
async function writeInPlace(
  target: string,
  data: string | Uint8Array,
  mode: number | undefined,
): Promise<void> {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const handle = await open(target, 'r+');
  try {
    await handle.writeFile(bytes);
    await handle.truncate(bytes.byteLength);
    await handle.sync();
    if (mode !== undefined) await handle.chmod(mode);
  } finally {
    await handle.close();
  }
}

/**
 * Writes a file atomically: the data goes to a temporary file in the same
 * directory, is flushed to disk with `fsync` and then renamed over the target.
 * Readers therefore observe either the old or the complete new content, never
 * a partially written file. The permission bits of an existing file are kept.
 *
 * An existing regular file is overwritten in place instead when replacing it
 * would break it or is impossible: it has other hard links or belongs to
 * another user, the folder does not allow creating the temporary file, or the
 * rename is refused (`EACCES`/`EPERM`, or `EBUSY` on Windows after retrying
 * with {@link AtomicWriteOptions.renameRetryDelaysMs}).
 *
 * This function does not check the target's own write permission; callers
 * saving user documents must refuse read-only files first.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const resolved = await resolveTarget(filePath);
  if (resolved.preferInPlace) return writeInPlace(resolved.target, data, options.mode);
  const mode = options.mode ?? resolved.mode;
  const tempPath = tempPathFor(resolved.target);
  let handle: FileHandle;
  try {
    handle = await open(tempPath, 'wx', mode ?? 0o666);
  } catch (error) {
    if (resolved.existingFile && isPermissionError(error)) {
      return writeInPlace(resolved.target, data, options.mode);
    }
    throw error;
  }
  try {
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode !== undefined) await chmod(tempPath, mode);
    await renameWithRetry(
      tempPath,
      resolved.target,
      platform,
      options.renameRetryDelaysMs ?? WINDOWS_RENAME_RETRY_DELAYS_MS,
    );
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    if (resolved.existingFile && isReplaceError(error, platform)) {
      return writeInPlace(resolved.target, data, options.mode);
    }
    throw error;
  }
}

/**
 * Synchronous variant of {@link writeFileAtomic} for the few places that must
 * persist state while the process may be about to exit (window bounds on close).
 * Symlinks are not followed; use it only for files owned by the application.
 */
export function writeFileAtomicSync(filePath: string, data: string): void {
  const tempPath = tempPathFor(filePath);
  const fd = openSync(tempPath, 'wx', 0o600);
  try {
    try {
      writeSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // The temporary file may not exist any more; nothing else to clean up.
    }
    throw error;
  }
}
