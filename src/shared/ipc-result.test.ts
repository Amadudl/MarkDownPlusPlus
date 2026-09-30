import { describe, expect, it } from 'vitest';
import { IPC_ERROR_CODES, IpcRequestError, isIpcResult, unwrapIpcResult } from './ipc-result';

describe('isIpcResult', () => {
  it('accepts successes and well-formed failures', () => {
    expect(isIpcResult({ ok: true, value: 1 })).toBe(true);
    expect(isIpcResult({ ok: true, value: undefined })).toBe(true);
    expect(isIpcResult({ ok: false, code: 'not-found', message: 'gone' })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isIpcResult(null)).toBe(false);
    expect(isIpcResult('ok')).toBe(false);
    expect(isIpcResult({ ok: true })).toBe(false);
    expect(isIpcResult({ ok: false, code: 'nope', message: 'x' })).toBe(false);
    expect(isIpcResult({ ok: false, code: 'io', message: 1 })).toBe(false);
    expect(isIpcResult({ ok: 'yes', value: 1 })).toBe(false);
  });
});

describe('unwrapIpcResult', () => {
  it('returns the value of a success', () => {
    expect(unwrapIpcResult({ ok: true, value: 42 })).toBe(42);
  });

  it('throws failures with their code and message, without any prefix', () => {
    try {
      unwrapIpcResult({ ok: false, code: 'read-only', message: '"/a.md" is read-only.' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(IpcRequestError);
      expect(error).toMatchObject({
        name: 'IpcRequestError',
        code: 'read-only',
        message: '"/a.md" is read-only.',
      });
    }
  });

  it('throws an internal error for malformed responses', () => {
    expect(() => unwrapIpcResult('garbage')).toThrow(IpcRequestError);
    expect(() => unwrapIpcResult(undefined)).toThrow('The main process sent an invalid response.');
  });

  it('lists every error code once', () => {
    expect(new Set(IPC_ERROR_CODES).size).toBe(IPC_ERROR_CODES.length);
  });
});
