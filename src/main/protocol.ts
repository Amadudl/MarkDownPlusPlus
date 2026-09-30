import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { protocol } from 'electron';
import { fromMppFileUrl, MPP_FILE_SCHEME } from '../shared/file-url';
import { readLocalImage, type LocalImagePolicy } from './services/localImages';

/** Scheme serving the bundled renderer. */
export const APP_SCHEME = 'mpp-app';
/** The only host of {@link APP_SCHEME}. */
export const APP_HOST = 'bundle';
/** Origin of the application pages in production. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
/** Entry page loaded into every application window in production. */
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

/** CSP for SVG images: prevents scripts inside an SVG from ever running. */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'";

const BUNDLE_MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

/** MIME type used for a bundled file, by extension. */
export function bundleMimeType(path: string): string {
  return BUNDLE_MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Registers the custom schemes as privileged. Must be called before the app is
 * ready: `mpp-app` behaves like a secure, standard origin (so `'self'`, fetch
 * and ES modules work); `mpp-file` only needs to be a secure image source.
 */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
    { scheme: MPP_FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

/**
 * Maps an `mpp-app://bundle/...` URL to a file inside `rootDir`, or `null` if
 * the URL is foreign or tries to escape the bundle (path traversal).
 */
export function resolveBundlePath(rootDir: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const relativePath = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = resolve(rootDir);
  const candidate = resolve(root, relativePath);
  return isInside(root, candidate) ? candidate : null;
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Creates the request handler of `mpp-app:` serving files from `rootDir`. */
export function createAppProtocolHandler(
  rootDir: string,
  csp: string,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return textResponse(405, 'Method Not Allowed');
    const candidate = resolveBundlePath(rootDir, request.url);
    if (candidate === null) return textResponse(404, 'Not Found');
    try {
      // Resolve symlinks and check containment again so links cannot leave the bundle.
      const [realRoot, realFile] = await Promise.all([realpath(rootDir), realpath(candidate)]);
      if (!isInside(realRoot, realFile) || !(await stat(realFile)).isFile())
        return textResponse(404, 'Not Found');
      const body = request.method === 'HEAD' ? null : await readFile(realFile);
      const headers: Record<string, string> = {
        'Content-Type': bundleMimeType(realFile),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      };
      if (extname(realFile).toLowerCase() === '.html') headers['Content-Security-Policy'] = csp;
      return new Response(body, { status: 200, headers });
    } catch {
      return textResponse(404, 'Not Found');
    }
  };
}

/**
 * Creates the request handler of `mpp-file:`, which serves allowlisted local
 * images only (and, on Windows, network paths only as `policy` allows).
 */
export function createFileProtocolHandler(
  policy: LocalImagePolicy = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET') return textResponse(403, 'Forbidden');
    const path = fromMppFileUrl(request.url);
    if (path === null) return textResponse(404, 'Not Found');
    const image = await readLocalImage(path, policy);
    if (image.kind === 'forbidden') return textResponse(403, 'Forbidden');
    if (image.kind === 'not-found') return textResponse(404, 'Not Found');
    const headers: Record<string, string> = {
      'Content-Type': image.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    };
    if (image.mimeType === 'image/svg+xml') headers['Content-Security-Policy'] = SVG_CSP;
    return new Response(image.data, { status: 200, headers });
  };
}

/** Installs both protocol handlers on the default session. Call after `app` is ready. */
export function installProtocols(rootDir: string, csp: string, imagePolicy: LocalImagePolicy = {}): void {
  protocol.handle(APP_SCHEME, createAppProtocolHandler(rootDir, csp));
  protocol.handle(MPP_FILE_SCHEME, createFileProtocolHandler(imagePolicy));
}
