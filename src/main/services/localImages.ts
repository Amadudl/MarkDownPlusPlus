import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { isUncOrDevicePath, uncHost } from '../../shared/file-url';

/** Largest local image served to the renderer or embedded into an export (50 MB). */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

/** The only file types the `mpp-file:` protocol serves, by lower-case extension. */
export const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

/** Outcome of {@link readLocalImage}. */
export type LocalImageResult =
  | { readonly kind: 'ok'; readonly data: Buffer; readonly mimeType: string }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not-found' };

/** Returns the image MIME type for `path`, or `null` if the extension is not allowlisted. */
export function imageMimeType(path: string): string | null {
  return IMAGE_MIME_TYPES[extname(path).toLowerCase()] ?? null;
}

/** Where local images may come from (see {@link readLocalImage}). */
export interface LocalImagePolicy {
  /** Platform whose path semantics apply; defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /**
   * Decides whether images may be read from a network share on `host` (a
   * lower-cased server name) on Windows. Without it, no network path is read.
   */
  readonly allowUncHost?: (host: string) => boolean;
}

/**
 * True if `path` may be touched at all. On Windows, reading a UNC path
 * (`\\server\share\…`, also written `//server/share/…`) connects to that
 * server over SMB and sends the user's NTLM credentials to it, so a document
 * must not be able to trigger it for arbitrary servers. Device paths
 * (`\\?\…`, `\\.\…`) are never allowed.
 */
export function isPermittedImagePath(path: string, policy: LocalImagePolicy = {}): boolean {
  if ((policy.platform ?? process.platform) !== 'win32' || !isUncOrDevicePath(path)) return true;
  const host = uncHost(path);
  return host !== null && (policy.allowUncHost?.(host) ?? false);
}

/**
 * Reads a local image if, and only if, it has an allowlisted image extension,
 * is a permitted path (see {@link isPermittedImagePath}), an existing regular
 * file and at most {@link MAX_IMAGE_BYTES} large.
 */
export async function readLocalImage(path: string, policy: LocalImagePolicy = {}): Promise<LocalImageResult> {
  const mimeType = imageMimeType(path);
  if (mimeType === null || !isPermittedImagePath(path, policy)) return { kind: 'forbidden' };
  try {
    const info = await stat(path);
    if (!info.isFile()) return { kind: 'not-found' };
    if (info.size > MAX_IMAGE_BYTES) return { kind: 'forbidden' };
    return { kind: 'ok', data: await readFile(path), mimeType };
  } catch {
    return { kind: 'not-found' };
  }
}
