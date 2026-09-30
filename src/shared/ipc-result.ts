/**
 * Result envelope of every renderer → main `invoke` channel.
 *
 * Handlers never reject for expected failures (a file that disappeared, a path
 * that was not granted, invalid arguments): they resolve with `{ ok: false }`
 * instead. That keeps the main-process log free of Electron's
 * "Error occurred in handler for …" stack traces and preserves the machine
 * readable {@link IpcErrorCode}, which a rejected `invoke` would lose. The
 * preload unwraps the envelope with {@link unwrapIpcResult}, so the renderer
 * still sees a rejected promise with a clean, user-facing message.
 */

/** Machine-readable reason of a failed IPC request. */
export type IpcErrorCode =
  /** The request did not match the channel's argument schema. */
  | 'invalid-argument'
  /** The path was never granted by a user action (dialog, OS open, drop, recent list, session). */
  | 'not-allowed'
  /** The path exists but is not a regular file. */
  | 'not-a-file'
  /** The file exceeds the size limit. */
  | 'too-large'
  /** The file contains NUL bytes. */
  | 'binary'
  /** The file is not valid UTF-8. */
  | 'not-utf8'
  /** The file is UTF-16 encoded (only UTF-8 is supported). */
  | 'unsupported-encoding'
  /** The file is write-protected. */
  | 'read-only'
  /** The file or folder does not exist. */
  | 'not-found'
  /** The operating system refused access. */
  | 'permission-denied'
  /** The disk or quota is full. */
  | 'no-space'
  /** The file is locked by another program. */
  | 'busy'
  /** Any other input/output error. */
  | 'io'
  /** An unexpected error inside the main process (a bug). */
  | 'internal';

/** Every {@link IpcErrorCode} (for validation and tests). */
export const IPC_ERROR_CODES: readonly IpcErrorCode[] = [
  'invalid-argument',
  'not-allowed',
  'not-a-file',
  'too-large',
  'binary',
  'not-utf8',
  'unsupported-encoding',
  'read-only',
  'not-found',
  'permission-denied',
  'no-space',
  'busy',
  'io',
  'internal',
];

/** A failed request: the reason and a message written for the user. */
export interface IpcFailure {
  readonly ok: false;
  readonly code: IpcErrorCode;
  readonly message: string;
}

/** A successful request and its value. */
export interface IpcSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

/** What every `invoke` channel resolves with. */
export type IpcResult<T> = IpcSuccess<T> | IpcFailure;

/** Error thrown by {@link unwrapIpcResult} for a failed request. */
export class IpcRequestError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IpcRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True if `value` has the shape of an {@link IpcResult}. */
export function isIpcResult(value: unknown): value is IpcResult<unknown> {
  if (!isRecord(value)) return false;
  if (value.ok === true) return 'value' in value;
  return (
    value.ok === false &&
    typeof value.message === 'string' &&
    IPC_ERROR_CODES.includes(value.code as IpcErrorCode)
  );
}

/**
 * Returns the value of a successful result and throws an
 * {@link IpcRequestError} for a failed one (or for anything that is not an
 * {@link IpcResult} at all). The value is `unknown`: its type is the contract
 * of the channel, which the caller (the preload) asserts.
 */
export function unwrapIpcResult(result: unknown): unknown {
  if (!isIpcResult(result)) {
    throw new IpcRequestError('internal', 'The main process sent an invalid response.');
  }
  if (result.ok) return result.value;
  throw new IpcRequestError(result.code, result.message);
}
