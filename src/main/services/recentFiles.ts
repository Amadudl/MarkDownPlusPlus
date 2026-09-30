import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { RecentFile } from '../../shared/types';
import { readJsonFile, SerialQueue, writeJsonFile } from './jsonStore';

/** Maximum number of entries kept in the recent files list. */
export const MAX_RECENT_FILES = 15;

const recentFileSchema = z.object({
  path: z.string().min(1).max(32_767).refine(isAbsolute),
  openedAt: z.number().nonnegative(),
});
const recentFilesFileSchema = z.object({
  version: z.literal(1),
  files: z.array(z.unknown()),
});

/** OS integration hooks (Electron `app.addRecentDocument` / `app.clearRecentDocuments`). */
export interface RecentDocumentsHooks {
  addRecentDocument(path: string): void;
  clearRecentDocuments(): void;
}

/** Options of {@link RecentFiles}. */
export interface RecentFilesOptions {
  readonly platform?: NodeJS.Platform;
  readonly hooks?: RecentDocumentsHooks;
  /** Clock used for `openedAt`; injectable for tests. */
  readonly now?: () => number;
}

type RecentListener = (files: readonly RecentFile[]) => void;

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The "Open Recent" list: most recent first, de-duplicated (case-insensitively
 * on Windows and macOS), capped at {@link MAX_RECENT_FILES} and persisted as JSON.
 */
export class RecentFiles {
  private files: RecentFile[] = [];
  private readonly listeners = new Set<RecentListener>();
  private readonly queue = new SerialQueue();
  private readonly caseInsensitive: boolean;
  private readonly now: () => number;

  constructor(
    private readonly filePath: string,
    private readonly options: RecentFilesOptions = {},
  ) {
    const platform = options.platform ?? process.platform;
    this.caseInsensitive = platform === 'win32' || platform === 'darwin';
    this.now = options.now ?? Date.now;
  }

  /** Loads the persisted list, dropping malformed entries. */
  async load(): Promise<readonly RecentFile[]> {
    const parsed = recentFilesFileSchema.safeParse(await readJsonFile(this.filePath));
    const entries = parsed.success ? parsed.data.files : [];
    const valid: RecentFile[] = [];
    for (const entry of entries) {
      const file = recentFileSchema.safeParse(entry);
      if (file.success && !valid.some((known) => this.same(known.path, file.data.path)))
        valid.push(file.data);
    }
    this.files = valid.slice(0, MAX_RECENT_FILES);
    return this.list();
  }

  /** The cached list (synchronous, used to build the menu). */
  list(): readonly RecentFile[] {
    return [...this.files];
  }

  /** Moves `path` to the top of the list (adding it if needed) and persists the list. */
  add(path: string): Promise<readonly RecentFile[]> {
    return this.queue.run(async () => {
      const absolute = resolve(path);
      const rest = this.files.filter((file) => !this.same(file.path, absolute));
      this.files = [{ path: absolute, openedAt: this.now() }, ...rest].slice(0, MAX_RECENT_FILES);
      this.options.hooks?.addRecentDocument(absolute);
      await this.persistAndNotify();
      return this.list();
    });
  }

  /**
   * Returns the entries whose file currently exists. Missing entries are only
   * hidden, never removed from the persisted list: a file on an unmounted
   * drive, an offline network share or a disconnected VPN volume comes back
   * once it is reachable again.
   */
  get(): Promise<RecentFile[]> {
    return this.queue.run(async () => {
      const existing: RecentFile[] = [];
      for (const file of this.files) if (await isRegularFile(file.path)) existing.push(file);
      return existing;
    });
  }

  /** Empties the list, including the OS-level recent documents. */
  clear(): Promise<void> {
    return this.queue.run(async () => {
      this.files = [];
      this.options.hooks?.clearRecentDocuments();
      await this.persistAndNotify();
    });
  }

  /** Subscribes to list changes; returns an unsubscribe function. */
  onChange(listener: RecentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private same(a: string, b: string): boolean {
    return this.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
  }

  /**
   * Persists the list and notifies listeners. Persisting is best effort: the
   * list is a convenience, so a read-only data folder or a full disk must never
   * make opening or saving a document fail. The in-memory list (and the menu)
   * stay up to date either way.
   */
  private async persistAndNotify(): Promise<void> {
    try {
      await writeJsonFile(this.filePath, { version: 1, files: this.files });
    } catch (error) {
      console.warn(`Could not save the recent files list: ${String(error)}`);
    }
    const snapshot = this.list();
    for (const listener of this.listeners) listener(snapshot);
  }
}
