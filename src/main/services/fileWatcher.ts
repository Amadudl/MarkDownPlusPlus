import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FileChangedEvent } from '../../shared/types';

/** Options of {@link FileWatcher}. */
export interface FileWatcherOptions {
  /** Delivers an event to one owner (a renderer, identified by its `webContents` id). */
  readonly emit: (ownerId: number, event: FileChangedEvent) => void;
  /** Quiet period before a burst of file system events is evaluated. */
  readonly debounceMs?: number;
  /** Poll interval used while a watched file does not exist. */
  readonly pollMs?: number;
}

interface WatchEntry {
  readonly path: string;
  readonly owners: Set<number>;
  watcher: FSWatcher | null;
  debounce: NodeJS.Timeout | null;
  poll: NodeJS.Timeout | null;
  /** Last modification time we know about; `null` while the file is missing. */
  knownMtime: number | null;
  disposed: boolean;
}

async function currentMtime(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.mtimeMs : null;
  } catch {
    return null;
  }
}

/**
 * Watches open documents for external modification or deletion. Bursts of
 * events are debounced, changes produced by our own saves are ignored (their
 * modification time is recorded via {@link FileWatcher.recordOwnWrite}) and the
 * watch survives editors that save by replacing the file.
 */
export class FileWatcher {
  private readonly entries = new Map<string, WatchEntry>();
  private readonly debounceMs: number;
  private readonly pollMs: number;

  constructor(private readonly options: FileWatcherOptions) {
    this.debounceMs = options.debounceMs ?? 250;
    this.pollMs = options.pollMs ?? 1000;
  }

  /** Starts watching `path` on behalf of `ownerId`. Watching a path twice is a no-op. */
  async watch(ownerId: number, inputPath: string): Promise<void> {
    const path = resolve(inputPath);
    const existing = this.entries.get(path);
    if (existing) {
      existing.owners.add(ownerId);
      return;
    }
    const entry: WatchEntry = {
      path,
      owners: new Set([ownerId]),
      watcher: null,
      debounce: null,
      poll: null,
      knownMtime: null,
      disposed: false,
    };
    this.entries.set(path, entry);
    entry.knownMtime = await currentMtime(path);
    if (entry.disposed) return;
    if (entry.knownMtime === null) this.startPolling(entry);
    else this.startNativeWatch(entry);
  }

  /** Stops watching `path` for `ownerId`; the watch ends when no owner is left. */
  unwatch(ownerId: number, inputPath: string): void {
    const entry = this.entries.get(resolve(inputPath));
    if (!entry) return;
    entry.owners.delete(ownerId);
    if (entry.owners.size === 0) this.disposeEntry(entry);
  }

  /** Removes every watch of `ownerId` (called when its window closes). */
  unwatchOwner(ownerId: number): void {
    for (const entry of [...this.entries.values()]) this.unwatch(ownerId, entry.path);
  }

  /** Records the modification time produced by one of our own saves so it is not reported. */
  recordOwnWrite(inputPath: string, mtimeMs: number): void {
    const entry = this.entries.get(resolve(inputPath));
    if (entry) entry.knownMtime = mtimeMs;
  }

  /** True if `path` is currently watched by anyone. */
  isWatching(inputPath: string): boolean {
    return this.entries.has(resolve(inputPath));
  }

  /** Stops all watches. */
  dispose(): void {
    for (const entry of [...this.entries.values()]) this.disposeEntry(entry);
  }

  private disposeEntry(entry: WatchEntry): void {
    entry.disposed = true;
    this.stopNativeWatch(entry);
    this.stopPolling(entry);
    if (entry.debounce) clearTimeout(entry.debounce);
    entry.debounce = null;
    this.entries.delete(entry.path);
  }

  private startNativeWatch(entry: WatchEntry): void {
    try {
      const watcher = fsWatch(entry.path, { persistent: false }, () => this.schedule(entry));
      watcher.on('error', () => {
        this.stopNativeWatch(entry);
        this.schedule(entry);
      });
      entry.watcher = watcher;
    } catch {
      this.startPolling(entry);
    }
  }

  private stopNativeWatch(entry: WatchEntry): void {
    entry.watcher?.close();
    entry.watcher = null;
  }

  private startPolling(entry: WatchEntry): void {
    if (entry.poll) return;
    entry.poll = setInterval(() => void this.pollOnce(entry), this.pollMs);
    entry.poll.unref();
  }

  private stopPolling(entry: WatchEntry): void {
    if (entry.poll) clearInterval(entry.poll);
    entry.poll = null;
  }

  private async pollOnce(entry: WatchEntry): Promise<void> {
    const mtime = await currentMtime(entry.path);
    if (mtime === null || entry.disposed) return;
    this.stopPolling(entry);
    this.startNativeWatch(entry);
    this.evaluate(entry, mtime);
  }

  private schedule(entry: WatchEntry): void {
    if (entry.debounce) clearTimeout(entry.debounce);
    entry.debounce = setTimeout(() => {
      entry.debounce = null;
      void this.check(entry);
    }, this.debounceMs);
    entry.debounce.unref();
  }

  private async check(entry: WatchEntry): Promise<void> {
    const mtime = await currentMtime(entry.path);
    if (entry.disposed) return;
    // Re-arm the native watcher: editors that save by renaming a temporary file
    // over the original leave the old watcher attached to a deleted inode.
    this.stopNativeWatch(entry);
    if (mtime === null) this.startPolling(entry);
    else this.startNativeWatch(entry);
    this.evaluate(entry, mtime);
  }

  private evaluate(entry: WatchEntry, mtime: number | null): void {
    if (mtime === entry.knownMtime) return;
    entry.knownMtime = mtime;
    const event: FileChangedEvent =
      mtime === null
        ? { path: entry.path, kind: 'deleted', mtimeMs: 0 }
        : { path: entry.path, kind: 'changed', mtimeMs: mtime };
    for (const owner of entry.owners) this.options.emit(owner, event);
  }
}
