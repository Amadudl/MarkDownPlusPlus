import type { Session } from 'electron';
import { devServerOrigin } from './security';

/** Options of {@link installRemoteImageGuard}. */
export interface RemoteImageGuardOptions {
  /** Reads the current `rendering.loadRemoteImages` setting (evaluated per request). */
  readonly allowed: () => boolean;
  /**
   * Resolves once pending settings writes have been applied. The renderer applies
   * a changed setting optimistically, so right after remote images were enabled an
   * image request can arrive before the main process has stored the new value.
   */
  readonly settled: () => Promise<void>;
  /** The Vite dev server, whose own assets are never blocked. */
  readonly devServerUrl: string | null;
}

/** URL patterns of every request that could reach a remote server. */
const REMOTE_URLS = ['http://*/*', 'https://*/*'];

/**
 * Cancels remote (`http:`/`https:`) image requests of a session while remote
 * images are disabled. The renderer already replaces blocked images with a
 * placeholder before they are requested; this guard is the second layer in the
 * main process, so a document can never act as a tracking pixel through a
 * code path that bypasses the renderer check. The setting is read for every
 * request (after pending settings writes), so changing it takes effect
 * immediately without a reload.
 */
export function installRemoteImageGuard(ses: Session, options: RemoteImageGuardOptions): void {
  const dev = devServerOrigin(options.devServerUrl);
  ses.webRequest.onBeforeRequest({ urls: REMOTE_URLS }, (details, callback) => {
    const fromDevServer = dev !== null && new URL(details.url).origin === dev;
    if (details.resourceType !== 'image' || fromDevServer || options.allowed()) {
      callback({ cancel: false });
      return;
    }
    // Decide once a settings write that may enable remote images has landed.
    options.settled().then(
      () => callback({ cancel: !options.allowed() }),
      () => callback({ cancel: true }),
    );
  });
}
