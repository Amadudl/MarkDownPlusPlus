import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Options of {@link extractFileArgs}. */
export interface FileArgsOptions {
  /** Working directory relative paths are resolved against. */
  readonly cwd: string;
  /**
   * True when running unpackaged via `electron <app>`: `argv[1]` is then the
   * application path and not a document.
   */
  readonly defaultApp: boolean;
}

/**
 * The file system path of a command-line argument: `file://` URIs (passed by
 * Linux desktop launchers for `%U` desktop entries, e.g. GNOME Files) are
 * converted, anything else is resolved against `cwd`.
 * @returns null for URIs that do not denote a local file.
 */
export function fileArgToPath(arg: string, cwd: string): string | null {
  if (!/^file:\/\//i.test(arg)) return resolve(cwd, arg);
  let url: URL;
  try {
    url = new URL(arg);
  } catch {
    return null;
  }
  // Only local files: on Windows `fileURLToPath` would turn `file://host/share/x.md`
  // into a UNC path, and merely checking that path connects to the (possibly
  // attacker-controlled) SMB server and leaks NTLM credentials.
  // (The URL parser already maps `file://localhost/` to an empty host.)
  if (url.hostname !== '') return null;
  try {
    return fileURLToPath(url);
  } catch {
    return null;
  }
}

/**
 * Extracts documents to open from a command line: skips the executable (and,
 * in development, the app path), ignores flags such as `--inspect` or macOS
 * `-psn_…` arguments, accepts paths and `file://` URIs and keeps only existing
 * regular files, as absolute paths.
 */
export function extractFileArgs(argv: readonly string[], options: FileArgsOptions): string[] {
  const files: string[] = [];
  for (const arg of argv.slice(options.defaultApp ? 2 : 1)) {
    if (arg === '' || arg.startsWith('-')) continue;
    const path = fileArgToPath(arg, options.cwd);
    if (path !== null && isRegularFile(path) && !files.includes(path)) files.push(path);
  }
  return files;
}

/** Files the OS asked us to open before a renderer was ready to receive them. */
export class PendingFileQueue {
  private readonly paths: string[] = [];

  /** Queues paths, skipping duplicates. */
  enqueue(paths: readonly string[]): void {
    for (const path of paths) if (!this.paths.includes(path)) this.paths.push(path);
  }

  /** Returns and clears the queued paths. */
  take(): string[] {
    return this.paths.splice(0);
  }

  get size(): number {
    return this.paths.length;
  }
}
