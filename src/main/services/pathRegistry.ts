import { posix, win32 } from 'node:path';
import { uncHost } from '../../shared/file-url';

/**
 * Remembers every file path granted access to during this run: files picked in
 * the open or save dialog, files the OS asked the app to open (command line,
 * second instance, macOS `open-file`), dropped Markdown/text files, the entries
 * of the recent-files list and the documents of the session file found at
 * startup (see `SessionStore.captureStartupSession`).
 *
 * Reading, writing, watching and revealing a file all require a registered
 * path, so the renderer can only touch files granted this way. Grants last for
 * the whole run: a compromised renderer can still read and overwrite any file
 * granted during it, but no other file. See SECURITY.md → "IPC".
 */
export class PathRegistry {
  private readonly paths = new Set<string>();

  /** @param platform Used to decide whether paths compare case-insensitively (Windows). */
  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  private key(path: string): string {
    const normalized = (this.platform === 'win32' ? win32 : posix).normalize(path);
    return this.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  /** Grants access to `path`. */
  add(path: string): void {
    this.paths.add(this.key(path));
  }

  /** True if `path` was granted earlier in this session. */
  has(path: string): boolean {
    return this.paths.has(this.key(path));
  }

  /**
   * True if a granted path lies on a network share of `host` (case-insensitive).
   * Used to allow images next to documents the user opened from that server.
   */
  hasUncHost(host: string): boolean {
    const wanted = host.toLowerCase();
    for (const path of this.paths) if (uncHost(path) === wanted) return true;
    return false;
  }

  /** Number of granted paths (diagnostics and tests). */
  get size(): number {
    return this.paths.size;
  }
}
