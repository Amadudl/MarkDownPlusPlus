import { describe, expect, it, vi } from 'vitest';
import { IpcValidationError, isSystemError, toIpcFailure } from './ipcErrors';
import { FileAccessError } from './services/fileService';
import { InvalidSettingsError } from './services/settingsStore';

function systemError(code: string, path?: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: failed`), { code, ...(path === undefined ? {} : { path }) });
}

describe('IpcValidationError', () => {
  it('defaults to invalid-argument and carries an explicit code', () => {
    expect(new IpcValidationError('bad')).toMatchObject({
      name: 'IpcValidationError',
      code: 'invalid-argument',
      message: 'bad',
    });
    expect(new IpcValidationError('no', 'not-allowed').code).toBe('not-allowed');
  });
});

describe('isSystemError', () => {
  it('recognises Node.js system errors only', () => {
    expect(isSystemError(systemError('ENOENT'))).toBe(true);
    expect(isSystemError(new Error('plain'))).toBe(false);
    expect(isSystemError(Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG_TYPE' }))).toBe(false);
    expect(isSystemError(Object.assign(new Error('x'), { code: 42 }))).toBe(false);
    expect(isSystemError({ code: 'ENOENT' })).toBe(false);
  });
});

describe('toIpcFailure', () => {
  it('passes policy refusals through with their code and message', () => {
    const refusal = new FileAccessError('binary', '/a.png');
    expect(toIpcFailure('file:read', refusal)).toEqual({
      ok: false,
      code: 'binary',
      message: refusal.message,
    });
    expect(toIpcFailure('file:watch', new IpcValidationError('nope', 'not-allowed'))).toEqual({
      ok: false,
      code: 'not-allowed',
      message: 'nope',
    });
  });

  it('reports rejected settings as invalid arguments', () => {
    expect(toIpcFailure('settings:set', new InvalidSettingsError('zoom too big'))).toEqual({
      ok: false,
      code: 'invalid-argument',
      message: 'Invalid settings: zoom too big',
    });
  });

  it.each([
    ['ENOENT', 'not-found', '"/a.md" does not exist. It may have been moved, renamed or deleted.'],
    ['ENOTDIR', 'not-found', '"/a.md" does not exist. It may have been moved, renamed or deleted.'],
    ['EACCES', 'permission-denied', 'You do not have permission to access "/a.md".'],
    ['EPERM', 'permission-denied', 'You do not have permission to access "/a.md".'],
    ['EROFS', 'read-only', '"/a.md" is on a read-only volume.'],
    ['ENOSPC', 'no-space', 'There is not enough disk space to write "/a.md".'],
    ['EDQUOT', 'no-space', 'There is not enough disk space to write "/a.md".'],
    ['EBUSY', 'busy', '"/a.md" is in use by another program. Close it there and try again.'],
    ['ETXTBSY', 'busy', '"/a.md" is in use by another program. Close it there and try again.'],
    ['EISDIR', 'not-a-file', '"/a.md" is not a regular file.'],
    ['EFBIG', 'too-large', '"/a.md" is too large.'],
    ['EIO', 'io', '"/a.md" could not be accessed (EIO).'],
  ])('maps %s to %s with a readable message', (errno, code, message) => {
    expect(toIpcFailure('file:read', systemError(errno, '/a.md'))).toEqual({ ok: false, code, message });
  });

  it('describes system errors without a path', () => {
    const describe = (errno: string): string => toIpcFailure('file:read', systemError(errno)).message;
    expect(describe('ENOENT')).toBe('The file does not exist. It may have been moved, renamed or deleted.');
    expect(describe('EACCES')).toBe('The operating system denied access to the file.');
    expect(describe('ENOSPC')).toBe('There is not enough disk space to write the file.');
    expect(describe('EIO')).toBe('The file could not be accessed (EIO).');
  });

  it('logs unexpected errors and reports them as internal', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(toIpcFailure('app:info', new TypeError('broken'))).toEqual({
        ok: false,
        code: 'internal',
        message: 'broken',
      });
      expect(toIpcFailure('app:info', new Error(''))).toMatchObject({ code: 'internal', message: 'Error' });
      expect(toIpcFailure('app:info', 'text')).toMatchObject({ code: 'internal', message: 'text' });
      expect(error).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledWith(
        'Unexpected error in the handler of app:info:',
        expect.any(TypeError),
      );
    } finally {
      error.mockRestore();
    }
  });
});
