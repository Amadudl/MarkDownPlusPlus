import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: { setPath: vi.fn(), getPath: vi.fn(() => '/user/data') },
}));
vi.mock('electron', () => electron);

const {
  configureUserData,
  PORTABLE_DATA_DIR_NAME,
  preloadPath,
  rendererDir,
  resolveUserDataLocation,
  userDataFile,
} = await import('./paths');

const base = {
  env: {},
  platform: 'darwin' as NodeJS.Platform,
  execPath: '/Apps/MarkDown++',
  isDirectory: () => false,
};

describe('resolveUserDataLocation', () => {
  it('keeps the default without overrides', () => {
    expect(resolveUserDataLocation(base)).toEqual({ dir: null, isPortable: false });
  });

  it('honours MPP_USER_DATA_DIR when absolute', () => {
    expect(resolveUserDataLocation({ ...base, env: { MPP_USER_DATA_DIR: '/tmp/e2e/../data' } })).toEqual({
      dir: resolve('/tmp/data'),
      isPortable: false,
    });
    expect(resolveUserDataLocation({ ...base, env: { MPP_USER_DATA_DIR: 'relative' } }).dir).toBeNull();
    expect(resolveUserDataLocation({ ...base, env: { MPP_USER_DATA_DIR: '  ' } }).dir).toBeNull();
  });

  it('uses the Windows portable executable folder', () => {
    const env = { PORTABLE_EXECUTABLE_DIR: 'D:\\Tools' };
    expect(resolveUserDataLocation({ ...base, platform: 'win32', env })).toEqual({
      dir: join('D:\\Tools', PORTABLE_DATA_DIR_NAME),
      isPortable: true,
    });
    expect(resolveUserDataLocation({ ...base, platform: 'linux', env }).isPortable).toBe(false);
  });

  it('detects a data folder beside the executable or the AppImage', () => {
    const seen: string[] = [];
    const isDirectory = (path: string): boolean => {
      seen.push(path);
      return true;
    };
    expect(resolveUserDataLocation({ ...base, execPath: '/opt/mpp/mpp', isDirectory })).toEqual({
      dir: join('/opt/mpp', PORTABLE_DATA_DIR_NAME),
      isPortable: true,
    });
    const appImage = resolveUserDataLocation({
      ...base,
      platform: 'linux',
      env: { APPIMAGE: '/home/me/Apps/MarkDown.AppImage' },
      execPath: '/tmp/.mount_x/mpp',
      isDirectory,
    });
    expect(appImage.dir).toBe(join('/home/me/Apps', PORTABLE_DATA_DIR_NAME));
    const macIgnoresAppImage = resolveUserDataLocation({
      ...base,
      env: { APPIMAGE: '/x/y.AppImage' },
      execPath: '/Apps/mpp',
      isDirectory,
    });
    expect(macIgnoresAppImage.dir).toBe(join('/Apps', PORTABLE_DATA_DIR_NAME));
    expect(seen).toHaveLength(3);
  });
});

describe('configureUserData', () => {
  let dir: string;
  const previous = process.env.MPP_USER_DATA_DIR;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mpp-paths-'));
    electron.app.setPath.mockClear();
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env.MPP_USER_DATA_DIR;
    else process.env.MPP_USER_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it('creates and applies an override directory', async () => {
    const target = join(dir, 'profile');
    process.env.MPP_USER_DATA_DIR = target;
    expect(configureUserData()).toEqual({ dir: target, isPortable: false });
    expect((await stat(target)).isDirectory()).toBe(true);
    expect(electron.app.setPath).toHaveBeenCalledWith('userData', target);
    expect(electron.app.setPath).toHaveBeenCalledWith('sessionData', target);
  });

  it('leaves Electron alone without an override', () => {
    delete process.env.MPP_USER_DATA_DIR;
    const location = configureUserData();
    expect(location.isPortable).toBe(false);
    expect(electron.app.setPath).not.toHaveBeenCalled();
  });
});

describe('bundle paths', () => {
  it('resolves files relative to the main bundle', () => {
    expect(userDataFile('settings.json')).toBe(join('/user/data', 'settings.json'));
    expect(rendererDir()).toBe(resolve(__dirname, '../renderer'));
    expect(preloadPath()).toBe(resolve(__dirname, '../preload/index.cjs'));
  });
});
