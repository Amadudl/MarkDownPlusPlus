import { mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { app } from 'electron';

/** Name of the folder that switches the application into portable mode. */
export const PORTABLE_DATA_DIR_NAME = 'MarkDownPlusPlus-data';

/** Where the application stores its data. */
export interface UserDataLocation {
  /** Directory to use instead of Electron's default, or `null` to keep the default. */
  readonly dir: string | null;
  /** True when data lives next to the executable (portable build). */
  readonly isPortable: boolean;
}

/** Inputs of {@link resolveUserDataLocation}; injectable for tests. */
export interface UserDataEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly execPath: string;
  readonly isDirectory: (path: string) => boolean;
}

function nonEmpty(value: string | undefined): string | null {
  return value !== undefined && value.trim() !== '' ? value : null;
}

/**
 * Decides where user data lives, in order of precedence:
 * 1. `MPP_USER_DATA_DIR` (absolute) — used by the end-to-end tests;
 * 2. Windows portable build (`PORTABLE_EXECUTABLE_DIR`) — `<dir>/MarkDownPlusPlus-data`;
 * 3. a `MarkDownPlusPlus-data` folder beside the executable (or beside `$APPIMAGE` on Linux);
 * 4. Electron's default per-user directory.
 */
export function resolveUserDataLocation(environment: UserDataEnvironment): UserDataLocation {
  const override = nonEmpty(environment.env.MPP_USER_DATA_DIR);
  if (override !== null && isAbsolute(override)) return { dir: resolve(override), isPortable: false };

  const portableExeDir = nonEmpty(environment.env.PORTABLE_EXECUTABLE_DIR);
  if (environment.platform === 'win32' && portableExeDir !== null) {
    return { dir: join(portableExeDir, PORTABLE_DATA_DIR_NAME), isPortable: true };
  }

  const appImage = environment.platform === 'linux' ? nonEmpty(environment.env.APPIMAGE) : null;
  const beside = join(dirname(appImage ?? environment.execPath), PORTABLE_DATA_DIR_NAME);
  if (environment.isDirectory(beside)) return { dir: beside, isPortable: true };

  return { dir: null, isPortable: false };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Applies {@link resolveUserDataLocation} to Electron. Must run before the
 * `ready` event, because Chromium locks its profile directory on startup.
 */
export function configureUserData(): UserDataLocation {
  const location = resolveUserDataLocation({
    env: process.env,
    platform: process.platform,
    execPath: process.execPath,
    isDirectory,
  });
  if (location.dir !== null) {
    mkdirSync(location.dir, { recursive: true });
    app.setPath('userData', location.dir);
    app.setPath('sessionData', location.dir);
  }
  return location;
}

/** Absolute path of a file inside the user data directory. */
export function userDataFile(name: string): string {
  return join(app.getPath('userData'), name);
}

/** Directory of the built renderer (`out/renderer`), relative to the main bundle in `out/main`. */
export function rendererDir(): string {
  return resolve(__dirname, '../renderer');
}

/** Absolute path of the preload bundle (`out/preload/index.cjs`). */
export function preloadPath(): string {
  return resolve(__dirname, '../preload/index.cjs');
}
