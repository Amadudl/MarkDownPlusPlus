import { app, shell, type Session, type WebContents } from 'electron';
import { APP_ORIGIN } from './protocol';

/** Longest URL we are willing to hand to the operating system. */
const MAX_EXTERNAL_URL_LENGTH = 8192;
const EXTERNAL_PROTOCOLS: ReadonlySet<string> = new Set(['https:', 'http:', 'mailto:']);

/** Permissions granted to the application's own pages; everything else is denied. */
const ALLOWED_APP_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Origin (`scheme://host:port`) of the Vite dev server URL, or `null`. */
export function devServerOrigin(devServerUrl: string | null): string | null {
  if (devServerUrl === null) return null;
  const parsed = parseUrl(devServerUrl);
  return parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.origin : null;
}

/**
 * Builds the Content-Security-Policy of the application pages. In development
 * the Vite dev server origin and its HMR websocket are allowed as well, plus
 * inline scripts for the React Fast Refresh preamble. `unsafe-eval` is never allowed.
 */
export function buildContentSecurityPolicy(devServerUrl: string | null): string {
  const dev = devServerOrigin(devServerUrl);
  const devSources = dev === null ? '' : ` ${dev}`;
  const devSocket = dev === null ? '' : ` ${dev.replace(/^http/, 'ws')}`;
  const devInline = dev === null ? '' : " 'unsafe-inline'";
  return [
    `default-src 'self'${devSources}`,
    `script-src 'self'${devSources}${devInline}`,
    `style-src 'self' 'unsafe-inline'${devSources}`,
    `img-src 'self' data: blob: mpp-file: https:${devSources}`,
    `font-src 'self' data:${devSources}`,
    `connect-src 'self'${devSources}${devSocket}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** `mailto:` header fields passed on to the mail client (RFC 6068); all others are dropped. */
export const MAILTO_FIELDS: ReadonlySet<string> = new Set(['to', 'cc', 'bcc', 'subject', 'body']);

function decodeOrNull(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Reduces a `mailto:` URL to its recipients and the `to`, `cc`, `bcc`,
 * `subject` and `body` fields. Other fields are dropped, above all `attach` /
 * `attachment`, which some mail clients honour by attaching a local file to
 * the draft (a document link could otherwise exfiltrate e.g. an SSH key).
 * Fields are kept byte for byte (no re-encoding).
 * @returns null for malformed URLs or recipients hiding a `?`.
 */
export function sanitizeMailtoUrl(url: string): string | null {
  const withoutFragment = url.split('#')[0] ?? '';
  const queryStart = withoutFragment.indexOf('?');
  const recipients = queryStart === -1 ? withoutFragment : withoutFragment.slice(0, queryStart);
  const decodedRecipients = decodeOrNull(recipients.slice('mailto:'.length));
  // An encoded "?" in the address part could be re-parsed as a header by the mail client.
  if (decodedRecipients === null || decodedRecipients.includes('?')) return null;
  if (queryStart === -1) return recipients;
  const fields = withoutFragment
    .slice(queryStart + 1)
    .split('&')
    .filter((field) => {
      const name = decodeOrNull(field.split('=')[0] ?? '');
      return name !== null && MAILTO_FIELDS.has(name.trim().toLowerCase());
    });
  return fields.length === 0 ? recipients : `${recipients}?${fields.join('&')}`;
}

/**
 * The form of `url` that may be opened in the user's default browser/mail
 * client, or `null` if it may not be opened: only `https:`, `http:` (with a
 * host and without credentials) and `mailto:` URLs qualify, and `mailto:`
 * URLs are reduced by {@link sanitizeMailtoUrl}.
 */
export function safeExternalUrl(url: string): string | null {
  if (url.length > MAX_EXTERNAL_URL_LENGTH) return null;
  const parsed = parseUrl(url);
  if (parsed === null || !EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
  if (parsed.protocol === 'mailto:') return sanitizeMailtoUrl(`mailto:${url.slice(url.indexOf(':') + 1)}`);
  return parsed.hostname !== '' && parsed.username === '' && parsed.password === '' ? url : null;
}

/** True if `url` may be opened externally (see {@link safeExternalUrl}). */
export function isSafeExternalUrl(url: string): boolean {
  return safeExternalUrl(url) !== null;
}

/** True if `url` belongs to the application itself (bundled renderer or dev server). */
export function isAppUrl(url: string, devServerUrl: string | null): boolean {
  const parsed = parseUrl(url);
  if (parsed === null) return false;
  if (`${parsed.protocol}//${parsed.host}` === APP_ORIGIN) return true;
  const dev = devServerOrigin(devServerUrl);
  return dev !== null && parsed.origin === dev;
}

/**
 * Opens an allowlisted URL externally (in its {@link safeExternalUrl} form);
 * returns false (and does nothing) otherwise.
 */
export async function openExternalSafely(url: string): Promise<boolean> {
  const safe = safeExternalUrl(url);
  if (safe === null) return false;
  await shell.openExternal(safe);
  return true;
}

/** Options shared by the hardening functions. */
export interface SecurityOptions {
  readonly devServerUrl: string | null;
}

/**
 * Hardens a session: every response gets the CSP header, and permission
 * requests/checks are denied except for a minimal allowlist on app pages.
 */
export function hardenSession(ses: Session, options: SecurityOptions): void {
  const csp = buildContentSecurityPolicy(options.devServerUrl);
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders: Record<string, string[]> = Object.fromEntries(
      Object.entries(details.responseHeaders ?? {}).filter(
        ([name]) => name.toLowerCase() !== 'content-security-policy',
      ),
    );
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    callback(ALLOWED_APP_PERMISSIONS.has(permission) && isAppUrl(contents.getURL(), options.devServerUrl));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return ALLOWED_APP_PERMISSIONS.has(permission) && isAppUrl(requestingOrigin, options.devServerUrl);
  });
}

/**
 * Hardens a `webContents`: no navigation away from the app, no new windows
 * (allowlisted links open in the OS browser instead) and no `<webview>`.
 */
export function hardenWebContents(contents: WebContents, options: SecurityOptions): void {
  const blockForeignNavigation = (event: { preventDefault(): void }, url: string): void => {
    if (!isAppUrl(url, options.devServerUrl)) event.preventDefault();
  };
  contents.on('will-navigate', (event) => blockForeignNavigation(event, event.url));
  contents.on('will-redirect', (event) => blockForeignNavigation(event, event.url));
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url).catch(() => undefined);
    return { action: 'deny' };
  });
}

/** Installs the process-wide guard that hardens every `webContents` ever created. */
export function installGlobalSecurity(options: SecurityOptions): void {
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents, options));
}
