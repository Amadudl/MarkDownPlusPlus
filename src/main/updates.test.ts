import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateCheckResult, UpdateInfo } from '../shared/types';
import type { UpdateServiceOptions } from './services/updateService';

const h = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events');
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  return {
    child,
    spawn: vi.fn(() => child),
    app: {
      isPackaged: true,
      runningUnderARM64Translation: false,
      getVersion: vi.fn(() => '1.0.5'),
      getPath: vi.fn((name: string) => `/tmp-of-${name}`),
      relaunch: vi.fn(),
    },
    session: { fromPartition: vi.fn((partition: string) => ({ partition })) },
    shell: { openPath: vi.fn(() => Promise.resolve('')) },
    openExternalSafely: vi.fn(() => Promise.resolve(true)),
    sessions: [] as (() => unknown)[],
    created: [] as UpdateServiceOptions[],
  };
});

vi.mock('node:child_process', () => ({ spawn: h.spawn }));
vi.mock('electron', () => ({ app: h.app, session: h.session, shell: h.shell }));
vi.mock('./security', () => ({ openExternalSafely: h.openExternalSafely }));
vi.mock('./services/httpClient', () => ({
  createHttpGet: (getSession: () => unknown) => {
    h.sessions.push(getSession);
    return 'http-get';
  },
}));
vi.mock('./services/updateService', () => ({
  UpdateService: class {
    constructor(readonly options: UpdateServiceOptions) {
      h.created.push(options);
    }
  },
}));

const {
  createUpdateService,
  resolveUpdateApiUrl,
  scheduleStartupUpdateCheck,
  spawnDetached,
  UPDATE_SESSION_PARTITION,
} = await import('./updates');
const { LATEST_RELEASE_API_URL } = await import('./services/updateCore');

beforeEach(() => {
  h.created.length = 0;
  h.sessions.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveUpdateApiUrl', () => {
  const github = { url: LATEST_RELEASE_API_URL, overridden: false };

  it('uses GitHub unless an unpackaged build is pointed at a loopback stub', () => {
    expect(resolveUpdateApiUrl({}, false)).toEqual(github);
    expect(resolveUpdateApiUrl({ MPP_UPDATE_API_URL: ' http://127.0.0.1:4100/latest ' }, false)).toEqual({
      url: 'http://127.0.0.1:4100/latest',
      overridden: true,
    });
    expect(resolveUpdateApiUrl({ MPP_UPDATE_API_URL: 'https://localhost/x' }, false).overridden).toBe(true);
    expect(resolveUpdateApiUrl({ MPP_UPDATE_API_URL: 'http://[::1]:9/x' }, false).overridden).toBe(true);
  });

  it('ignores the override in packaged builds and for anything but loopback http(s)', () => {
    expect(resolveUpdateApiUrl({ MPP_UPDATE_API_URL: 'http://127.0.0.1:4100/latest' }, true)).toEqual(github);
    for (const value of [
      'https://evil.example/latest',
      'file:///etc/passwd',
      'http://user:pw@127.0.0.1/x',
      'http://127.0.0.1.evil.example/x',
      'not a url',
      '   ',
    ]) {
      expect(resolveUpdateApiUrl({ MPP_UPDATE_API_URL: value }, false), value).toEqual(github);
    }
  });
});

describe('spawnDetached', () => {
  it('starts the program detached and logs a failed start', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      spawnDetached('C:\\Temp\\setup.exe', ['/S']);
      expect(h.spawn).toHaveBeenCalledWith('C:\\Temp\\setup.exe', ['/S'], {
        detached: true,
        stdio: 'ignore',
      });
      expect(h.child.unref).toHaveBeenCalled();
      const failure = new Error('ENOENT');
      h.child.emit('error', failure);
      expect(error).toHaveBeenCalledWith(
        'Could not start the update installer C:\\Temp\\setup.exe:',
        failure,
      );
    } finally {
      error.mockRestore();
      h.child.removeAllListeners();
    }
  });
});

describe('createUpdateService', () => {
  it('wires the service to Electron', async () => {
    const hooks = { onProgress: vi.fn(), requestQuit: vi.fn() };
    createUpdateService({ url: 'http://127.0.0.1:1/latest', overridden: true }, hooks);
    const [options] = h.created;
    if (options === undefined) throw new Error('service expected');
    expect(options).toMatchObject({
      currentVersion: '1.0.5',
      httpGet: 'http-get',
      apiUrl: 'http://127.0.0.1:1/latest',
      userAgent: 'MarkDownPlusPlus/1.0.5 (+https://github.com/Amadudl/MarkDownPlusPlus)',
      requestQuit: hooks.requestQuit,
      onProgress: hooks.onProgress,
      spawnDetached,
    });
    // A folder only this app uses (not the shared %TEMP%), inside its own user data.
    expect(options.downloadDir.replace(/\\/g, '/')).toBe('/tmp-of-userData/updates');

    expect(h.sessions[0]?.()).toEqual({ partition: UPDATE_SESSION_PARTITION });
    expect(h.session.fromPartition).toHaveBeenCalledWith('mpp-updates');
    await options.openPath('/x.dmg');
    expect(h.shell.openPath).toHaveBeenCalledWith('/x.dmg');
    await options.openExternal('https://github.com/');
    expect(h.openExternalSafely).toHaveBeenCalledWith('https://github.com/');
    options.relaunch('/home/me/MarkDown++.AppImage');
    expect(h.app.relaunch).toHaveBeenCalledWith({ execPath: '/home/me/MarkDown++.AppImage', args: [] });
  });
});

describe('scheduleStartupUpdateCheck', () => {
  const update = { version: '2.0.0' } as UpdateInfo;
  const available: UpdateCheckResult = { status: 'available', update };

  function schedule(overrides: { enabled?: boolean; result?: () => Promise<UpdateCheckResult> } = {}) {
    const check = vi.fn(() => (overrides.result ? overrides.result() : Promise.resolve(available)));
    const announce = vi.fn();
    const cancel = scheduleStartupUpdateCheck({
      delayMs: 4000,
      enabled: () => overrides.enabled ?? true,
      check,
      announce,
    });
    return { check, announce, cancel };
  }

  it('checks once after the delay and announces a newer version', async () => {
    vi.useFakeTimers();
    const { check, announce } = schedule();
    await vi.advanceTimersByTimeAsync(3999);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(update);
  });

  it('stays quiet when up to date, disabled or cancelled', async () => {
    vi.useFakeTimers();
    const upToDate = schedule({
      result: () =>
        Promise.resolve({ status: 'up-to-date', currentVersion: '1.0.5', latestVersion: '1.0.5' }),
    });
    const disabled = schedule({ enabled: false });
    const cancelled = schedule();
    cancelled.cancel();
    await vi.advanceTimersByTimeAsync(4000);
    expect(upToDate.check).toHaveBeenCalled();
    expect(upToDate.announce).not.toHaveBeenCalled();
    expect(disabled.check).not.toHaveBeenCalled();
    expect(cancelled.check).not.toHaveBeenCalled();
  });

  it('only logs a failed background check', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const failing = schedule({ result: () => Promise.reject(new Error('offline')) });
      // A rejection that is not an Error (e.g. from a misbehaving dependency).
      const oddCheck = vi.fn<() => Promise<UpdateCheckResult>>().mockRejectedValue('odd');
      const odd = schedule({ result: () => oddCheck() });
      await vi.advanceTimersByTimeAsync(4000);
      expect(failing.announce).not.toHaveBeenCalled();
      expect(odd.announce).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('The update check at startup failed: offline');
      expect(warn).toHaveBeenCalledWith('The update check at startup failed: odd');
    } finally {
      warn.mockRestore();
    }
  });
});
