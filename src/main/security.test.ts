import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: { on: vi.fn() },
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));
vi.mock('electron', () => electron);

const {
  buildContentSecurityPolicy,
  devServerOrigin,
  hardenSession,
  hardenWebContents,
  installGlobalSecurity,
  isAppUrl,
  isSafeExternalUrl,
  MAILTO_FIELDS,
  openExternalSafely,
  safeExternalUrl,
  sanitizeMailtoUrl,
} = await import('./security');

const DEV = 'http://localhost:5183/';

beforeEach(() => {
  electron.shell.openExternal.mockClear();
});

describe('buildContentSecurityPolicy', () => {
  it('builds the strict production policy', () => {
    expect(buildContentSecurityPolicy(null)).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: mpp-file: https:; font-src 'self' data:; connect-src 'self'; " +
        "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it('allows the dev server and its websocket in development, never unsafe-eval', () => {
    const csp = buildContentSecurityPolicy(DEV);
    expect(csp).toContain("script-src 'self' http://localhost:5183 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' http://localhost:5183 ws://localhost:5183");
    expect(csp).not.toContain('unsafe-eval');
    expect(buildContentSecurityPolicy('https://dev.local:8443')).toContain('wss://dev.local:8443');
  });

  it('ignores unusable dev server URLs', () => {
    expect(buildContentSecurityPolicy('file:///x')).toBe(buildContentSecurityPolicy(null));
    expect(buildContentSecurityPolicy('::nope')).toBe(buildContentSecurityPolicy(null));
    expect(devServerOrigin(null)).toBeNull();
  });
});

describe('isSafeExternalUrl', () => {
  it.each([
    ['https://example.com/path?q=1', true],
    ['http://example.com', true],
    ['mailto:someone@example.com', true],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
    ['mpp-app://bundle/index.html', false],
    ['data:text/html,hi', false],
    ['https://user:pass@example.com', false],
    ['https://user@example.com', false],
    ['not a url', false],
    [`https://example.com/${'a'.repeat(9000)}`, false],
  ])('%s -> %s', (url, expected) => {
    expect(isSafeExternalUrl(url)).toBe(expected);
  });
});

describe('safeExternalUrl / sanitizeMailtoUrl', () => {
  it('returns web URLs unchanged', () => {
    expect(safeExternalUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
  });

  it('keeps only recipients and the standard mailto fields', () => {
    expect([...MAILTO_FIELDS].sort()).toEqual(['bcc', 'body', 'cc', 'subject', 'to']);
    expect(safeExternalUrl('mailto:x@evil.example?attach=/home/u/.ssh/id_rsa')).toBe('mailto:x@evil.example');
    expect(
      safeExternalUrl(
        'MAILTO:a@b.example?Subject=Invoice%20due&attachment=%2Fetc%2Fpasswd&cc=c@d.example&body=Hi+there',
      ),
    ).toBe('mailto:a@b.example?Subject=Invoice%20due&cc=c@d.example&body=Hi+there');
    expect(sanitizeMailtoUrl('mailto:a@b.example?%61ttach=/x&BCC=e@f.example')).toBe(
      'mailto:a@b.example?BCC=e@f.example',
    );
    expect(sanitizeMailtoUrl('mailto:?to=a@b.example')).toBe('mailto:?to=a@b.example');
    expect(sanitizeMailtoUrl('mailto:a@b.example#fragment')).toBe('mailto:a@b.example');
    expect(sanitizeMailtoUrl('mailto:a@b.example?')).toBe('mailto:a@b.example');
  });

  it('refuses mailto URLs that hide fields in the address or cannot be decoded', () => {
    expect(sanitizeMailtoUrl('mailto:a@b.example%3Fattach=/etc/passwd')).toBeNull();
    expect(sanitizeMailtoUrl('mailto:%E0%A4%A')).toBeNull();
    expect(sanitizeMailtoUrl('mailto:a@b.example?%E0%A4%A=1&subject=x')).toBe('mailto:a@b.example?subject=x');
    expect(isSafeExternalUrl('mailto:a@b.example%3Fattach=/etc/passwd')).toBe(false);
  });
});

describe('isAppUrl', () => {
  it('accepts the bundle origin and the dev server only', () => {
    expect(isAppUrl('mpp-app://bundle/index.html', null)).toBe(true);
    expect(isAppUrl('mpp-app://evil/index.html', null)).toBe(false);
    expect(isAppUrl('http://localhost:5183/src/main.tsx', DEV)).toBe(true);
    expect(isAppUrl('http://localhost:5183/', null)).toBe(false);
    expect(isAppUrl('http://localhost:9999/', DEV)).toBe(false);
    expect(isAppUrl('garbage', DEV)).toBe(false);
  });
});

describe('openExternalSafely', () => {
  it('opens allowlisted URLs only', async () => {
    expect(await openExternalSafely('https://example.com')).toBe(true);
    expect(await openExternalSafely('file:///etc/passwd')).toBe(false);
    expect(electron.shell.openExternal).toHaveBeenCalledTimes(1);
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://example.com');
    expect(await openExternalSafely('mailto:x@evil.example?attach=/home/u/.ssh/id_rsa')).toBe(true);
    expect(electron.shell.openExternal).toHaveBeenLastCalledWith('mailto:x@evil.example');
  });
});

describe('hardenSession', () => {
  type HeadersHandler = (
    details: { responseHeaders?: Record<string, string[]> },
    callback: (response: { responseHeaders: Record<string, string[]> }) => void,
  ) => void;

  function setup(devServerUrl: string | null) {
    let headers: HeadersHandler = () => undefined;
    let request: (
      contents: { getURL(): string },
      permission: string,
      callback: (ok: boolean) => void,
    ) => void = () => undefined;
    let check: (contents: unknown, permission: string, origin: string) => boolean = () => true;
    const ses = {
      webRequest: {
        onHeadersReceived: (handler: HeadersHandler) => {
          headers = handler;
        },
      },
      setPermissionRequestHandler: (handler: typeof request) => {
        request = handler;
      },
      setPermissionCheckHandler: (handler: typeof check) => {
        check = handler;
      },
    };
    hardenSession(ses as never, { devServerUrl });
    return { headers: () => headers, request: () => request, check: () => check };
  }

  it('replaces any CSP header with ours', () => {
    const { headers } = setup(null);
    const callback = vi.fn();
    headers()({ responseHeaders: { 'content-security-policy': ['weak'], 'X-Other': ['1'] } }, callback);
    expect(callback).toHaveBeenCalledWith({
      responseHeaders: { 'X-Other': ['1'], 'Content-Security-Policy': [buildContentSecurityPolicy(null)] },
    });
    headers()({}, callback);
    expect(callback).toHaveBeenLastCalledWith({
      responseHeaders: { 'Content-Security-Policy': [buildContentSecurityPolicy(null)] },
    });
  });

  it('denies permissions except clipboard writes from app pages', () => {
    const { request, check } = setup(DEV);
    const decide = (url: string, permission: string): boolean => {
      let granted = true;
      request()({ getURL: () => url }, permission, (ok) => {
        granted = ok;
      });
      return granted;
    };
    expect(decide('mpp-app://bundle/index.html', 'clipboard-sanitized-write')).toBe(true);
    expect(decide('https://evil.example', 'clipboard-sanitized-write')).toBe(false);
    expect(decide('mpp-app://bundle/index.html', 'media')).toBe(false);
    expect(decide('mpp-app://bundle/index.html', 'notifications')).toBe(false);
    expect(check()(null, 'clipboard-sanitized-write', 'http://localhost:5183')).toBe(true);
    expect(check()(null, 'geolocation', 'mpp-app://bundle')).toBe(false);
    expect(check()(null, 'clipboard-sanitized-write', 'https://evil.example')).toBe(false);
  });
});

describe('hardenWebContents', () => {
  class FakeContents extends EventEmitter {
    openHandler: ((details: { url: string }) => { action: string }) | null = null;
    setWindowOpenHandler(handler: (details: { url: string }) => { action: string }): void {
      this.openHandler = handler;
    }
  }

  const navigation = (url: string) => ({ url, preventDefault: vi.fn() });

  it('blocks navigation and redirects away from the app', () => {
    const contents = new FakeContents();
    hardenWebContents(contents as never, { devServerUrl: DEV });
    const inside = navigation('mpp-app://bundle/index.html');
    const outside = navigation('https://evil.example');
    const redirect = navigation('file:///etc/passwd');
    const devPage = navigation('http://localhost:5183/');
    contents.emit('will-navigate', inside);
    contents.emit('will-navigate', outside);
    contents.emit('will-redirect', redirect);
    contents.emit('will-navigate', devPage);
    expect(inside.preventDefault).not.toHaveBeenCalled();
    expect(devPage.preventDefault).not.toHaveBeenCalled();
    expect(outside.preventDefault).toHaveBeenCalled();
    expect(redirect.preventDefault).toHaveBeenCalled();
  });

  it('never attaches webviews', () => {
    const contents = new FakeContents();
    hardenWebContents(contents as never, { devServerUrl: null });
    const event = { preventDefault: vi.fn() };
    contents.emit('will-attach-webview', event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('denies new windows and opens safe links externally', async () => {
    const contents = new FakeContents();
    hardenWebContents(contents as never, { devServerUrl: null });
    expect(contents.openHandler?.({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    expect(contents.openHandler?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    await Promise.resolve();
    expect(electron.shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('swallows failures of the OS handler', async () => {
    electron.shell.openExternal.mockImplementationOnce(() => Promise.reject(new Error('no browser')));
    const contents = new FakeContents();
    hardenWebContents(contents as never, { devServerUrl: null });
    contents.openHandler?.({ url: 'https://example.com' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(electron.shell.openExternal).toHaveBeenCalled();
  });
});

describe('installGlobalSecurity', () => {
  it('hardens every web contents created later', () => {
    installGlobalSecurity({ devServerUrl: null });
    const [eventName, listener] = electron.app.on.mock.calls[0] as unknown as [
      string,
      (event: unknown, contents: unknown) => void,
    ];
    expect(eventName).toBe('web-contents-created');
    const contents = new (class extends EventEmitter {
      setWindowOpenHandler = vi.fn();
    })();
    listener({}, contents);
    expect(contents.setWindowOpenHandler).toHaveBeenCalled();
    expect(contents.listenerCount('will-navigate')).toBe(1);
  });
});
