/**
 * Minimal HTTP GET on top of Electron's `net` module (Chromium's network stack,
 * so the system proxy configuration applies) for the update function. Every
 * redirect is checked against an allowlist before it is followed, the body is
 * size-limited and streamed (with backpressure), a request without progress
 * times out, and an optional overall deadline bounds the whole request.
 */
import { net, type ClientRequest, type IncomingMessage, type Session } from 'electron';
import { UpdateError } from './updateCore';

/**
 * Lets the consumer of a response apply backpressure. While paused, the
 * response delivers no data and the idle timeout is suspended (the overall
 * deadline keeps running).
 */
export interface FlowControl {
  pause(): void;
  resume(): void;
}

/** Options of one {@link HttpGet} request. */
export interface HttpGetOptions {
  readonly headers: Readonly<Record<string, string>>;
  /**
   * Idle timeout: aborts when the server sends nothing (headers, redirect or
   * data) for this long. Re-armed by every event, so it does not limit the total time.
   */
  readonly timeoutMs: number;
  /** Overall time limit of the whole request, from start to the last byte; none if omitted. */
  readonly deadlineMs?: number;
  /** Largest accepted body; a larger `Content-Length` or body aborts the request. */
  readonly maxBytes: number;
  /** Decides whether the URL (and every redirect target) may be requested. */
  readonly isAllowedUrl: (url: URL) => boolean;
  /** Receives the body chunk by chunk. A throwing callback aborts the request. */
  readonly onData: (chunk: Buffer, flow: FlowControl) => void;
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

/**
 * Electron's `IncomingMessage` is a Node `Readable` at runtime (pausing it stops
 * reading from the network), but its type declarations omit `pause`/`resume`.
 */
interface Pausable {
  pause(): unknown;
  resume(): unknown;
}

function isPausable(value: object): value is Pausable {
  const candidate = value as Partial<Record<keyof Pausable, unknown>>;
  return typeof candidate.pause === 'function' && typeof candidate.resume === 'function';
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
      let deadline: NodeJS.Timeout | undefined;
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
        clearTimeout(deadline);
        current.abort();
        reject(error);
      };
      const succeed = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(deadline);
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
        let paused = false;
        const pausable = isPausable(response) ? response : null;
        const flow: FlowControl = {
          pause: () => {
            if (settled || paused || pausable === null) return;
            paused = true;
            clearTimeout(timer);
            pausable.pause();
          },
          resume: () => {
            if (settled || !paused) return;
            paused = false;
            arm();
            pausable?.resume();
          },
        };
        arm();
        response.on('data', (chunk) => {
          if (settled) return;
          received += chunk.length;
          if (received > options.maxBytes) {
            fail(new UpdateError(`The file from ${host} is larger than expected.`));
            return;
          }
          if (!paused) arm();
          try {
            options.onData(chunk, flow);
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

      if (options.deadlineMs !== undefined) {
        const limit = options.deadlineMs;
        deadline = setTimeout(() => {
          fail(new UpdateError(`${host} did not finish within ${String(Math.round(limit / 1000))} s.`));
        }, limit);
      }
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
