import type { SessionState } from '../../shared/types';
import { sessionStateSchema } from '../validation';
import { readJsonFile, SerialQueue, writeJsonFile } from './jsonStore';
import { PathRegistry } from './pathRegistry';

/**
 * Persists the open tabs (paths and editor modes) in `session.json` so they can
 * be restored on the next start. Invalid files are ignored.
 *
 * A session is untrusted renderer state, so it must never become a way to grant
 * file access: {@link captureStartupSession} records the documents of the
 * session written by the *previous* run before any renderer exists, and only
 * those count as restorable (see {@link isRestorable}). Documents a renderer
 * adds to the file later are not granted by loading it again.
 */
export class SessionStore {
  private readonly queue = new SerialQueue();
  private readonly restorable: PathRegistry;

  /**
   * @param filePath Location of `session.json`.
   * @param platform Decides whether paths compare case-insensitively (Windows).
   */
  constructor(
    private readonly filePath: string,
    platform: NodeJS.Platform = process.platform,
  ) {
    this.restorable = new PathRegistry(platform);
  }

  /**
   * Remembers the documents of the session saved by the previous run as
   * restorable. Call once at startup, before any window (and therefore any
   * renderer) is created.
   */
  async captureStartupSession(): Promise<void> {
    const state = await this.load();
    for (const document of state?.documents ?? []) this.restorable.add(document.path);
  }

  /** True if `path` was part of the session found at startup. */
  isRestorable(path: string): boolean {
    return this.restorable.has(path);
  }

  /** Returns the saved session, or `null` if none exists or it is invalid. */
  async load(): Promise<SessionState | null> {
    const parsed = sessionStateSchema.safeParse(await readJsonFile(this.filePath));
    return parsed.success ? parsed.data : null;
  }

  /** Validates and writes the session. */
  save(state: SessionState): Promise<void> {
    return this.queue.run(() => writeJsonFile(this.filePath, sessionStateSchema.parse(state)));
  }
}
