import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { IpcErrorCode } from '../../shared/ipc-result';
import type { FileReadResult, FileSaveRequest, FileSaveResult, LineEnding } from '../../shared/types';
import { writeFileAtomic } from './atomicWrite';
import type { PathRegistry } from './pathRegistry';

/** Largest document the editor opens or saves (50 MB). */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/**
 * Extensions of markdown and plain-text documents. They select the dialog
 * filters and the files accepted by drag and drop; reading a file always needs
 * a grant (see {@link PathRegistry}), whatever its extension.
 */
export const MARKDOWN_EXTENSIONS: readonly string[] = [
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdwn',
  '.mdx',
  '.txt',
];

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);

/** Machine-readable reason of a {@link FileAccessError} (a subset of the IPC error codes). */
export type FileAccessErrorCode = Extract<
  IpcErrorCode,
  'not-allowed' | 'not-a-file' | 'too-large' | 'binary' | 'not-utf8' | 'unsupported-encoding' | 'read-only'
>;

/** A file operation was refused for a policy reason (as opposed to an I/O error). */
export class FileAccessError extends Error {
  constructor(
    readonly code: FileAccessErrorCode,
    path: string,
  ) {
    super(FileAccessError.describe(code, path));
    this.name = 'FileAccessError';
  }

  private static describe(code: FileAccessErrorCode, path: string): string {
    switch (code) {
      case 'not-allowed':
        return `Access to "${path}" was not granted. Open or save the file through a dialog first.`;
      case 'not-a-file':
        return `"${path}" is not a regular file.`;
      case 'too-large':
        return `"${path}" is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`;
      case 'binary':
        return `"${path}" looks like a binary file and cannot be edited as text.`;
      case 'not-utf8':
        return `"${path}" is not UTF-8 encoded text. Convert it to UTF-8 in another editor first, so no characters are lost when it is saved.`;
      case 'unsupported-encoding':
        return `"${path}" is UTF-16 encoded. Only UTF-8 text files can be opened; convert it to UTF-8 first.`;
      case 'read-only':
        return `"${path}" is read-only. Remove its write protection, or use Save As to save a copy.`;
    }
  }
}

/** True if the path has one of the {@link MARKDOWN_EXTENSIONS} (case-insensitive). */
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extname(path).toLowerCase());
}

/** Result of {@link decodeDocument}. */
export interface DecodedDocument {
  /** Content with every line ending normalised to `\n` and without BOM. */
  readonly content: string;
  readonly lineEnding: LineEnding;
  readonly hasBom: boolean;
}

/** True if the bytes start with a UTF-16 (little- or big-endian) byte-order mark. */
export function hasUtf16Bom(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 2));
  return head.equals(UTF16_LE_BOM) || head.equals(UTF16_BE_BOM);
}

/**
 * Decodes raw UTF-8 bytes of a document: strips a byte-order mark, detects the
 * dominant line ending (CRLF wins ties so Windows files stay Windows files) and
 * normalises all line endings to LF.
 * @returns null if the bytes are not valid UTF-8 (e.g. a Windows-1252 file):
 *   decoding them would replace characters with U+FFFD, and saving would then
 *   destroy the original bytes.
 */
export function decodeDocument(bytes: Uint8Array): DecodedDocument | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hasBom = buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      buffer.subarray(hasBom ? UTF8_BOM.length : 0),
    );
  } catch {
    return null;
  }
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  const lineEnding: LineEnding = crlf > 0 && crlf >= lf ? 'crlf' : 'lf';
  return { content: text.replace(/\r\n?/g, '\n'), lineEnding, hasBom };
}

/** Inverse of {@link decodeDocument}: applies the line ending and optional BOM. */
export function encodeDocument(content: string, lineEnding: LineEnding, hasBom: boolean): Buffer {
  const normalized = content.replace(/\r\n?/g, '\n');
  const text = lineEnding === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized;
  const body = Buffer.from(text, 'utf8');
  return hasBom ? Buffer.concat([UTF8_BOM, body]) : body;
}

/**
 * Refuses to overwrite a write-protected file (POSIX mode without write
 * permission, or the Windows read-only attribute). An atomic save renames a
 * new file over the target, which only needs permission on the folder, so
 * without this check the user's write protection would be silently bypassed.
 * A missing file is fine: it is about to be created.
 */
async function assertWritable(path: string): Promise<void> {
  try {
    await access(path, constants.W_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    if (code === 'EACCES' || code === 'EPERM') throw new FileAccessError('read-only', path);
    throw error;
  }
}

/** Options of {@link FileService}. */
export interface FileServiceOptions {
  /** Called after every successful save with the new modification time (used by the watcher). */
  readonly onSaved?: (path: string, mtimeMs: number) => void;
}

/**
 * Reads and writes markdown documents on behalf of the renderer while enforcing
 * the access policy described in the architecture document.
 */
export class FileService {
  constructor(
    private readonly registry: PathRegistry,
    private readonly options: FileServiceOptions = {},
  ) {}

  /**
   * Reads a document the user granted (whatever its extension). Only UTF-8
   * text is accepted: binary, UTF-16 and other non-UTF-8 files are refused so
   * that saving can never silently corrupt them.
   */
  async read(inputPath: string): Promise<FileReadResult> {
    const path = resolve(inputPath);
    if (!this.registry.has(path)) throw new FileAccessError('not-allowed', path);
    const info = await stat(path);
    if (!info.isFile()) throw new FileAccessError('not-a-file', path);
    if (info.size > MAX_DOCUMENT_BYTES) throw new FileAccessError('too-large', path);
    const bytes = await readFile(path);
    if (hasUtf16Bom(bytes)) throw new FileAccessError('unsupported-encoding', path);
    if (bytes.includes(0)) throw new FileAccessError('binary', path);
    const decoded = decodeDocument(bytes);
    if (decoded === null) throw new FileAccessError('not-utf8', path);
    return { path, ...decoded, mtimeMs: info.mtimeMs };
  }

  /**
   * Saves a document to a path the user granted; returns the new modification
   * time. A write-protected file is refused instead of being replaced.
   */
  async save(request: FileSaveRequest): Promise<FileSaveResult> {
    const path = resolve(request.path);
    if (!this.registry.has(path)) throw new FileAccessError('not-allowed', path);
    const bytes = encodeDocument(request.content, request.lineEnding, request.hasBom);
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new FileAccessError('too-large', path);
    await assertWritable(path);
    await writeFileAtomic(path, bytes);
    const { mtimeMs } = await stat(path);
    this.options.onSaved?.(path, mtimeMs);
    return { path, mtimeMs };
  }

  /** Grants `path` (chosen by the user in a save dialog) and saves to it. */
  async saveAs(path: string, request: Omit<FileSaveRequest, 'path'>): Promise<FileSaveResult> {
    this.registry.add(resolve(path));
    return this.save({ ...request, path });
  }
}
