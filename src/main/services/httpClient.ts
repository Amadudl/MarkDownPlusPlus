/**
 * Minimal HTTP GET on top of Electron's `net` module (Chromium's network stack,
 * so the system proxy configuration applies) for the update function. Every
 * redirect is checked against an allowlist before it is followed, the body is
 * size-limited and streamed, and a request without progress times out.
 */
import { net, type ClientRequest, type IncomingMessage, type Session } from 'electron';
import { UpdateError } from './updateCore';

/** Options of one {@link HttpGet} request. */
export interface HttpGetOptions {
  readonly headers: Readonly<Record<string, string>>;
  /** Aborts when the server sends nothing (headers, redirect or data) for this long. */
  readonly timeoutMs: number;
  /** Largest accepted body; a larger `Content-Length` or body aborts the request. */
  readonly maxBytes: number;
  /** Decides whether the URL (and every redirect target) may be requested. */
  readonly isAllowedUrl: (url: URL) => boolean;
  /** Receives the body chunk by chunk. A throwing callback aborts the request. */
  readonly onData: (chunk: Buffer) => void;
}

/**
 * Performs a GET request and resolves once the complete body was delivered to
 * `onData`. Rejects with an {@link UpdateError} (user-facing message) for a
 * refused URL or redirect, a status other than 200, a timeout, a body that is
 * too large or incomplete, or a network error.
 */
export type HttpGet = (url: string, options: HttpGetOptions) => Promise<void>;

/** Most redirects followed for one request (GitHub needs one for release downloads). */
export const MAX_REDIRECTS = 5;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function contentLengthOf(response: IncomingMessage): number | null {
  const value = headerValue(response.headers['content-length']);
  return value !== undefined && /^\d{1,15}$/.test(value) ? Number(value) : null;
}

/**
 * Creates an {@link HttpGet} that sends its requests through `getSession()`
 * (resolved per request, so it may be created before the app is ready).
 * Requests never carry cookies or credentials.
 */
export function createHttpGet(getSession: () => Session): HttpGet {
  return (url, options) =>
    new Promise<void>((resolve, reject) => {
      const initial = parseUrl(url);
      if (initial === null || !options.isAllowedUrl(initial)) {
        reject(new UpdateError(`Refused to connect to ${initial?.host ?? 'an invalid address'}.`));
        return;
      }
      const host = initial.host;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const current: ClientRequest = net.request({
        url,
        method: 'GET',
        redirect: 'manual',
        session: getSession(),
        credentials: 'omit',
        headers: { ...options.headers },
      });

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        current.abort();
        reject(error);
      };
      const succeed = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const arm = (): void => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          fail(new UpdateError(`The connection to ${host} timed out.`));
        }, options.timeoutMs);
      };

      let redirects = 0;

      current.on('redirect', (_status, _method, redirectUrl) => {
        redirects += 1;
        const target = parseUrl(redirectUrl);
        if (redirects > MAX_REDIRECTS) {
          fail(new UpdateError(`${host} redirected too many times.`));
        } else if (target === null || !options.isAllowedUrl(target)) {
          fail(
            new UpdateError(
              `${host} redirected to an address that is not allowed (${target?.host ?? 'invalid'}).`,
            ),
          );
        } else {
          arm();
          current.followRedirect();
        }
      });

      current.on('response', (response) => {
        if (response.statusCode !== 200) {
          fail(new UpdateError(`${host} answered with HTTP status ${String(response.statusCode)}.`));
          return;
        }
        const expected = contentLengthOf(response);
        if (expected !== null && expected > options.maxBytes) {
          fail(new UpdateError(`The file from ${host} is larger than expected.`));
          return;
        }
        let received = 0;
        arm();
        response.on('data', (chunk) => {
          if (settled) return;
          received += chunk.length;
          if (received > options.maxBytes) {
            fail(new UpdateError(`The file from ${host} is larger than expected.`));
            return;
          }
          arm();
          try {
            options.onData(chunk);
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        });
        response.on('end', () => {
          if (expected !== null && received !== expected) {
            fail(new UpdateError(`The download from ${host} was incomplete.`));
          } else {
            succeed();
          }
        });
        response.on('aborted', () => fail(new UpdateError(`The download from ${host} was interrupted.`)));
        response.on('error', (error) => {
          fail(new UpdateError(`The download from ${host} failed: ${error.message}`));
        });
      });

      current.on('error', (error) => {
        fail(new UpdateError(`Could not connect to ${host}: ${error.message}`));
      });

      arm();
      current.end();
    });
}

/** Performs `httpGet` and collects the whole body (for small responses such as JSON). */
export async function httpGetBuffer(
  httpGet: HttpGet,
  url: string,
  options: Omit<HttpGetOptions, 'onData'>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await httpGet(url, { ...options, onData: (chunk) => chunks.push(chunk) });
  return Buffer.concat(chunks);
}
