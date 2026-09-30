/**
 * URL scheme used by the renderer to display local images. The main process
 * serves `mpp-file://local/<encoded absolute path>` for image files only.
 */
export const MPP_FILE_SCHEME = 'mpp-file';
const PREFIX = `${MPP_FILE_SCHEME}://local/`;

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const URL_WITH_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** True for POSIX absolute paths and Windows drive or UNC paths. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || WINDOWS_DRIVE.test(path) || path.startsWith('\\\\');
}

const UNC_OR_DEVICE = /^[\\/]{2}/;
const UNC_ROOT = /^[\\/]{2}([^\\/?.][^\\/]*)[\\/]+[^\\/]+/;

/**
 * True for Windows network (UNC, `\\server\share`) and device paths
 * (`\\?\…`, `\\.\…`), in either slash direction. On Windows, touching such a
 * path makes the OS connect to the server (SMB), which sends the user's
 * credentials (NTLM) to it.
 */
export function isUncOrDevicePath(path: string): boolean {
  return UNC_OR_DEVICE.test(path);
}

/**
 * Server name of a UNC path (`\\server\share\…` or `//server/share/…`),
 * lower-cased; `null` for every other path, including device paths.
 */
export function uncHost(path: string): string | null {
  return UNC_ROOT.exec(path)?.[1]?.toLowerCase() ?? null;
}

/** Converts an absolute file system path to an `mpp-file:` URL. */
export function toMppFileUrl(absolutePath: string): string {
  if (!isAbsolutePath(absolutePath)) throw new Error(`Not an absolute path: ${absolutePath}`);
  return PREFIX + encodeURIComponent(absolutePath.replace(/\\/g, '/'));
}

/** Inverse of {@link toMppFileUrl}; returns null for anything that is not a valid `mpp-file:` URL. */
export function fromMppFileUrl(url: string): string | null {
  if (!url.startsWith(PREFIX)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.slice(PREFIX.length).split(/[?#]/)[0] ?? '');
  } catch {
    return null;
  }
  if (decoded.includes('\0') || !isAbsolutePath(decoded)) return null;
  return decoded;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  // The root directory is returned as '' so that joining with '/' yields '/name', not '//name'.
  return index <= 0 ? '' : normalized.slice(0, index);
}

/** Resolves `.` and `..` segments of a forward-slash path. */
function normalizeSegments(path: string): string {
  const drive = /^(?:[a-zA-Z]:|\/\/[^/]+\/[^/]+)/.exec(path)?.[0] ?? '';
  const rest = path.slice(drive.length);
  const out: string[] = [];
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return `${drive}/${out.join('/')}`;
}

/**
 * `mpp-file:` URL of a local image path, or `null` for a network path on a
 * server other than the document's own: a document must never make the app
 * connect to an arbitrary server (see {@link isUncOrDevicePath}). Images next
 * to a document opened from a network share keep working.
 */
function localImageUrl(path: string, documentPath: string | null, raw: string = path): string | null {
  if (isUncOrDevicePath(raw) || isUncOrDevicePath(path)) {
    const host = uncHost(path);
    if (host === null || documentPath === null || host !== uncHost(documentPath)) return null;
  }
  return toMppFileUrl(path);
}

/**
 * Maps an image `src` found in a markdown document to something the renderer
 * may load: remote `https:`/`http:` URLs are returned unchanged (or `null` when
 * remote images are disabled), `data:`/`blob:` pass through, and relative or
 * absolute local paths become `mpp-file:` URLs. Other schemes, device paths and
 * network (UNC) paths outside the document's own server are rejected.
 */
export function resolveImageSrc(
  src: string,
  documentPath: string | null,
  loadRemoteImages: boolean,
): string | null {
  const trimmed = src.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith(PREFIX)) {
    const path = fromMppFileUrl(trimmed);
    return path !== null && localImageUrl(path, documentPath) !== null ? trimmed : null;
  }
  if (/^(data:image\/|blob:)/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return loadRemoteImages ? trimmed : null;
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const path = decodeURIComponent(new URL(trimmed).pathname);
      const fsPath = /^\/[a-zA-Z]:\//.test(path) ? path.slice(1) : path;
      return localImageUrl(normalizeSegments(fsPath), documentPath, fsPath);
    } catch {
      return null;
    }
  }
  if (URL_WITH_SCHEME.test(trimmed) && !WINDOWS_DRIVE.test(trimmed)) return null;
  let pathPart = trimmed.split(/[?#]/)[0] ?? '';
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch {
    return null;
  }
  if (isAbsolutePath(pathPart)) {
    return localImageUrl(normalizeSegments(pathPart.replace(/\\/g, '/')), documentPath, pathPart);
  }
  if (documentPath === null) return null;
  return localImageUrl(normalizeSegments(`${dirname(documentPath)}/${pathPart}`), documentPath);
}
