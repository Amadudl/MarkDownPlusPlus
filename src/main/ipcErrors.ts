import type { IpcErrorCode, IpcFailure } from '../shared/ipc-result';
import { FileAccessError } from './services/fileService';
import { InvalidSettingsError } from './services/settingsStore';

/** Thrown when an IPC request is refused; `code` tells the renderer why. */
export class IpcValidationError extends Error {
  constructor(
    message: string,
    readonly code: IpcErrorCode = 'invalid-argument',
  ) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

/** Node.js system error codes mapped to the IPC error codes they are reported as. */
const ERRNO_CODES: Readonly<Record<string, IpcErrorCode>> = {
  ENOENT: 'not-found',
  ENOTDIR: 'not-found',
  EACCES: 'permission-denied',
  EPERM: 'permission-denied',
  EROFS: 'read-only',
  ENOSPC: 'no-space',
  EDQUOT: 'no-space',
  EBUSY: 'busy',
  ETXTBSY: 'busy',
  EISDIR: 'not-a-file',
  EFBIG: 'too-large',
};

/** The parts of a Node.js system error (`ErrnoException`) the mapping reads. */
interface SystemError {
  readonly code: string;
  readonly path?: string;
}

/** True for Node.js system errors such as `ENOENT` (an upper-case `E…` code). */
export function isSystemError(error: unknown): error is Error & SystemError {
  if (!(error instanceof Error)) return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && /^E[A-Z0-9]+$/.test(code);
}

function describeSystemError(code: IpcErrorCode, errno: string, path: string | undefined): string {
  const subject = path === undefined ? 'The file' : `"${path}"`;
  switch (code) {
    case 'not-found':
      return `${subject} does not exist. It may have been moved, renamed or deleted.`;
    case 'permission-denied':
      return path === undefined
        ? 'The operating system denied access to the file.'
        : `You do not have permission to access "${path}".`;
    case 'read-only':
      return `${subject} is on a read-only volume.`;
    case 'no-space':
      return `There is not enough disk space to write ${path === undefined ? 'the file' : `"${path}"`}.`;
    case 'busy':
      return `${subject} is in use by another program. Close it there and try again.`;
    case 'not-a-file':
      return `${subject} is not a regular file.`;
    case 'too-large':
      return `${subject} is too large.`;
    default:
      return `${subject} could not be accessed (${errno}).`;
  }
}

/**
 * Converts anything a handler threw into an {@link IpcFailure}. Policy
 * refusals ({@link FileAccessError}, {@link IpcValidationError}), rejected
 * settings ({@link InvalidSettingsError}) and file system errors are expected
 * and become user-facing messages silently; anything else is a bug or a
 * genuine malfunction (e.g. a PDF render timing out), so it is logged with its
 * stack and reported as `internal`.
 */
export function toIpcFailure(channel: string, error: unknown): IpcFailure {
  if (error instanceof FileAccessError || error instanceof IpcValidationError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof InvalidSettingsError) {
    return { ok: false, code: 'invalid-argument', message: error.message };
  }
  if (isSystemError(error)) {
    const code = ERRNO_CODES[error.code] ?? 'io';
    return { ok: false, code, message: describeSystemError(code, error.code, error.path) };
  }
  console.error(`Unexpected error in the handler of ${channel}:`, error);
  const message = error instanceof Error && error.message !== '' ? error.message : String(error);
  return { ok: false, code: 'internal', message };
}
