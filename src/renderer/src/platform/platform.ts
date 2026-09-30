/** Operating systems the shell distinguishes for key labels and window chrome. */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux';

interface NavigatorLike {
  readonly userAgent: string;
  readonly platform?: string;
}

/**
 * Synchronously detects the operating system from the navigator. Used before the
 * authoritative value from `app.info()` is available (first paint).
 */
export function detectPlatform(nav: NavigatorLike = navigator): DesktopPlatform {
  const hint = `${nav.platform ?? ''} ${nav.userAgent}`.toLowerCase();
  if (hint.includes('mac')) return 'darwin';
  if (hint.includes('win')) return 'win32';
  return 'linux';
}

/** Narrows a Node.js `process.platform` value to the platforms the UI knows about. */
export function toDesktopPlatform(platform: string): DesktopPlatform {
  if (platform === 'darwin' || platform === 'win32') return platform;
  return 'linux';
}

/** Adds `platform-<os>` to the body so CSS can adapt (e.g. macOS traffic-light inset). */
export function applyPlatformClass(platform: DesktopPlatform, body: HTMLElement = document.body): void {
  for (const candidate of ['darwin', 'win32', 'linux'] as const) {
    body.classList.toggle(`platform-${candidate}`, candidate === platform);
  }
}
