import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowControl, HttpGetOptions } from './httpClient';

const h = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events');
  class FakeResponse extends EventEmitter {
    // Electron's IncomingMessage is a Node Readable at runtime.
    readonly pause = vi.fn();
    readonly resume = vi.fn();
    constructor(
      readonly statusCode: number,
      readonly headers: Record<string, string | string[]>,
    ) {
      super();
    }
  }
  class FakeRequest extends EventEmitter {
    readonly followRedirect = vi.fn();
    readonly abort = vi.fn();
    ended = false;
    constructor(readonly options: Record<string, unknown>) {
      super();
    }
    end(): void {
      this.ended = true;
    }
    respond(status: number, headers: Record<string, string | string[]> = {}): FakeResponse {
      const response = new FakeResponse(status, headers);
      this.emit('response', response);
      return response;
    }
    redirect(url: string): void {
      this.emit('redirect', 302, 'GET', url, {});
    }
  }
  return { requests: [] as FakeRequest[], FakeRequest, FakeResponse };
});

vi.mock('electron', () => ({
  net: {
    request: (options: Record<string, unknown>) => {
      const request = new h.FakeRequest(options);
      h.requests.push(request);
      return request;
    },
  },
}));

const { createHttpGet, httpGetBuffer, MAX_REDIRECTS } = await import('./httpClient');
const { UpdateError } = await import('./updateCore');

const session = { id: 'updates' };
const httpGet = createHttpGet(() => session as never);
const ALLOWED = new Set(['github.com', 'release-assets.githubusercontent.com']);

function options(overrides: Partial<HttpGetOptions> = {}): HttpGetOptions & { chunks: Buffer[] } {
  const chunks: Buffer[] = [];
  return {
    headers: { 'User-Agent': 'test' },
    timeoutMs: 1000,
    maxBytes: 10,
    isAllowedUrl: (url) => url.protocol === 'https:' && ALLOWED.has(url.hostname),
    onData: (chunk) => chunks.push(chunk),
    chunks,
    ...overrides,
  };
}

function lastRequest(): InstanceType<typeof h.FakeRequest> {
  const request = h.requests.at(-1);
  if (request === undefined) throw new Error('no request was made');
  return request;
}

const URL_A = 'https://github.com/Amadudl/MarkDownPlusPlus/releases/download/v1/a.exe';

beforeEach(() => {
  h.requests.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createHttpGet', () => {
  it('streams the body of a 200 response through a cookie-less request', async () => {
    const opts = options();
    const done = httpGet(URL_A, opts);
    const request = lastRequest();
    expect(request.options).toEqual({
      url: URL_A,
      method: 'GET',
      redirect: 'manual',
      session,
      credentials: 'omit',
      headers: { 'User-Agent': 'test' },
    });
    expect(request.ended).toBe(true);
    const response = request.respond(200, { 'content-length': ['5'] });
    response.emit('data', Buffer.from('he'));
    response.emit('data', Buffer.from('llo'));
    response.emit('end');
    await done;
    expect(Buffer.concat(opts.chunks).toString()).toBe('hello');
    expect(request.abort).not.toHaveBeenCalled();
  });

  it('refuses URLs outside the allowlist without connecting', async () => {
    await expect(httpGet('https://evil.example/a.exe', options())).rejects.toThrow(
      'Refused to connect to evil.example.',
    );
    await expect(httpGet('not a url', options())).rejects.toThrow(
      'Refused to connect to an invalid address.',
    );
    expect(h.requests).toHaveLength(0);
  });

  it('follows redirects to allowed hosts only', async () => {
    const done = httpGet(URL_A, options());
    const request = lastRequest();
    request.redirect('https://release-assets.githubusercontent.com/asset?sig=1');
    expect(request.followRedirect).toHaveBeenCalledTimes(1);
    const response = request.respond(200);
    response.emit('data', Buffer.from('ok'));
    response.emit('end');
    await expect(done).resolves.toBeUndefined();
  });

  it('rejects a redirect to a foreign host and aborts the request', async () => {
    const done = httpGet(URL_A, options());
    const request = lastRequest();
    request.redirect('https://evil.example/payload.exe');
    await expect(done).rejects.toThrow(
      'github.com redirected to an address that is not allowed (evil.example).',
    );
    expect(request.followRedirect).not.toHaveBeenCalled();
    expect(request.abort).toHaveBeenCalled();
  });

  it('rejects a downgrade to http and unparseable redirect targets', async () => {
    const downgrade = httpGet(URL_A, options());
    lastRequest().redirect('http://github.com/a.exe');
    await expect(downgrade).rejects.toBeInstanceOf(UpdateError);
    const invalid = httpGet(URL_A, options());
    lastRequest().redirect('::invalid');
    await expect(invalid).rejects.toThrow('(invalid)');
  });

  it('gives up after too many redirects', async () => {
    const done = httpGet(URL_A, options());
    const request = lastRequest();
    for (let index = 0; index <= MAX_REDIRECTS; index += 1) request.redirect(URL_A);
    await expect(done).rejects.toThrow('github.com redirected too many times.');
    expect(request.followRedirect).toHaveBeenCalledTimes(MAX_REDIRECTS);
  });

  it('rejects responses other than 200', async () => {
    const done = httpGet(URL_A, options());
    lastRequest().respond(404);
    await expect(done).rejects.toThrow('github.com answered with HTTP status 404.');
  });

  it('enforces the size limit by Content-Length and by the received bytes', async () => {
    const declared = httpGet(URL_A, options());
    lastRequest().respond(200, { 'content-length': '11' });
    await expect(declared).rejects.toThrow('larger than expected');

    const opts = options();
    const streamed = httpGet(URL_A, opts);
    const request = lastRequest();
    const response = request.respond(200, { 'content-length': 'bogus' });
    response.emit('data', Buffer.alloc(6));
    response.emit('data', Buffer.alloc(6));
    await expect(streamed).rejects.toThrow('larger than expected');
    expect(request.abort).toHaveBeenCalled();
    // Data after the failure is ignored.
    response.emit('data', Buffer.alloc(1));
    expect(opts.chunks).toHaveLength(1);
  });

  it('rejects a body shorter than its Content-Length', async () => {
    const done = httpGet(URL_A, options());
    const response = lastRequest().respond(200, { 'content-length': '8' });
    response.emit('data', Buffer.alloc(4));
    response.emit('end');
    await expect(done).rejects.toThrow('The download from github.com was incomplete.');
  });

  it('times out when the server stays silent, but not while data arrives', async () => {
    vi.useFakeTimers();
    const silent = httpGet(URL_A, options());
    const silentResult = expect(silent).rejects.toThrow('The connection to github.com timed out.');
    await vi.advanceTimersByTimeAsync(1000);
    await silentResult;
    expect(lastRequest().abort).toHaveBeenCalled();

    const slow = httpGet(URL_A, options({ maxBytes: 100 }));
    const request = lastRequest();
    await vi.advanceTimersByTimeAsync(900);
    request.redirect('https://release-assets.githubusercontent.com/x');
    await vi.advanceTimersByTimeAsync(900);
    const response = request.respond(200);
    for (let index = 0; index < 3; index += 1) {
      await vi.advanceTimersByTimeAsync(900);
      response.emit('data', Buffer.alloc(1));
    }
    response.emit('end');
    await expect(slow).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('enforces an overall deadline even while data keeps trickling in', async () => {
    vi.useFakeTimers();
    let settled = false;
    const trickle = httpGet(URL_A, options({ maxBytes: 1000, deadlineMs: 3000 }));
    const result = trickle.then(
      () => {
        settled = true;
      },
      (error: unknown) => {
        settled = true;
        throw error;
      },
    );
    const checked = expect(result).rejects.toThrow('github.com did not finish within 3 s.');
    const request = lastRequest();
    const response = request.respond(200);
    // One byte every 900 ms never trips the 1000 ms idle timeout.
    for (let index = 0; index < 3; index += 1) {
      await vi.advanceTimersByTimeAsync(900);
      response.emit('data', Buffer.alloc(1));
    }
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    await checked;
    expect(request.abort).toHaveBeenCalled();

    // A request that finishes in time clears the deadline.
    const quick = httpGet(URL_A, options({ deadlineMs: 3000 }));
    lastRequest().respond(200).emit('end');
    await expect(quick).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('lets the consumer pause the response without tripping the idle timeout', async () => {
    vi.useFakeTimers();
    let flow: FlowControl | undefined;
    const done = httpGet(
      URL_A,
      options({
        maxBytes: 100,
        onData: (_chunk, control) => {
          flow = control;
          control.pause();
        },
      }),
    );
    const response = lastRequest().respond(200);
    response.emit('data', Buffer.alloc(1));
    expect(response.pause).toHaveBeenCalledTimes(1);
    // A slow disk may hold the response far longer than the idle timeout.
    await vi.advanceTimersByTimeAsync(10_000);
    flow?.resume();
    expect(response.resume).toHaveBeenCalledTimes(1);
    response.emit('end');
    await expect(done).resolves.toBeUndefined();

    // After resuming, the idle timeout applies again.
    const stalled = httpGet(
      URL_A,
      options({
        maxBytes: 100,
        onData: (_chunk, control) => {
          control.pause();
          control.resume();
        },
      }),
    );
    const stalledResult = expect(stalled).rejects.toThrow('timed out');
    lastRequest().respond(200).emit('data', Buffer.alloc(1));
    await vi.advanceTimersByTimeAsync(1000);
    await stalledResult;
  });

  it('ignores flow control that does not apply', async () => {
    const controls: FlowControl[] = [];
    const done = httpGet(URL_A, options({ onData: (_chunk, control) => controls.push(control) }));
    const response = lastRequest().respond(200);
    response.emit('data', Buffer.alloc(1));
    const [flow] = controls;
    if (flow === undefined) throw new Error('flow control expected');
    // Resuming a response that is not paused does nothing.
    flow.resume();
    expect(response.resume).not.toHaveBeenCalled();
    response.emit('end');
    await done;
    // After the request settled, pausing does nothing either.
    flow.pause();
    expect(response.pause).not.toHaveBeenCalled();

    // Resuming after the request failed while paused does nothing.
    const pausedControls: FlowControl[] = [];
    const failed = httpGet(
      URL_A,
      options({
        onData: (_chunk, control) => {
          pausedControls.push(control);
          control.pause();
        },
      }),
    );
    const failedResponse = lastRequest().respond(200);
    failedResponse.emit('data', Buffer.alloc(1));
    failedResponse.emit('aborted');
    await expect(failed).rejects.toThrow('interrupted');
    pausedControls[0]?.resume();
    expect(failedResponse.resume).not.toHaveBeenCalled();

    // A response without pause/resume (not a Readable) keeps flowing.
    const plain = httpGet(URL_A, options({ onData: (_chunk, control) => control.pause() }));
    const plainResponse = new h.FakeResponse(200, {});
    Reflect.deleteProperty(plainResponse, 'pause');
    lastRequest().emit('response', plainResponse);
    plainResponse.emit('data', Buffer.alloc(1));
    plainResponse.emit('end');
    await expect(plain).resolves.toBeUndefined();
  });

  it('reports network, stream and abort errors', async () => {
    const connect = httpGet(URL_A, options());
    lastRequest().emit('error', new Error('net::ERR_NAME_NOT_RESOLVED'));
    await expect(connect).rejects.toThrow('Could not connect to github.com: net::ERR_NAME_NOT_RESOLVED');

    const stream = httpGet(URL_A, options());
    lastRequest().respond(200).emit('error', new Error('net::ERR_CONNECTION_RESET'));
    await expect(stream).rejects.toThrow('The download from github.com failed: net::ERR_CONNECTION_RESET');

    const aborted = httpGet(URL_A, options());
    lastRequest().respond(200).emit('aborted');
    await expect(aborted).rejects.toThrow('The download from github.com was interrupted.');
  });

  it('ignores events that arrive after the request settled', async () => {
    const done = httpGet(URL_A, options());
    const request = lastRequest();
    const response = request.respond(200);
    response.emit('end');
    await expect(done).resolves.toBeUndefined();
    request.emit('error', new Error('late'));
    response.emit('end');

    const failed = httpGet(URL_A, options());
    const second = lastRequest();
    const secondResponse = second.respond(500);
    await expect(failed).rejects.toThrow('HTTP status 500');
    secondResponse.emit('end');
    second.emit('error', new Error('late'));
    expect(second.abort).toHaveBeenCalledTimes(1);
  });

  it('aborts when the consumer of the data fails', async () => {
    const failing = httpGet(
      URL_A,
      options({
        onData: () => {
          throw new Error('disk full');
        },
      }),
    );
    const request = lastRequest();
    request.respond(200).emit('data', Buffer.alloc(1));
    await expect(failing).rejects.toThrow('disk full');
    expect(request.abort).toHaveBeenCalled();

    const odd = httpGet(
      URL_A,
      options({
        onData: () => {
          throw 'odd' as unknown as Error;
        },
      }),
    );
    lastRequest().respond(200).emit('data', Buffer.alloc(1));
    await expect(odd).rejects.toThrow('odd');
  });
});

describe('httpGetBuffer', () => {
  it('collects the whole body', async () => {
    const done = httpGetBuffer(httpGet, URL_A, options());
    const response = lastRequest().respond(200);
    response.emit('data', Buffer.from('{"a"'));
    response.emit('data', Buffer.from(':1}'));
    response.emit('end');
    expect((await done).toString()).toBe('{"a":1}');
  });
});
