import { constants, type Stats } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

/** Size of the chunks {@link readRegularFile} reads. */
const READ_CHUNK_BYTES = 64 * 1024;

/**
 * Read-only, and non-blocking where the flag exists: opening a FIFO for
 * reading would otherwise wait for a writer before the type check can refuse
 * it. `O_NONBLOCK` does not change reads of regular files. `O_NOCTTY` keeps an
 * opened terminal device from becoming the controlling terminal. Both are
 * undefined on Windows (which has neither), where `| undefined` adds nothing.
 * The file is opened before its type is known, so that the type check applies
 * to exactly the file that is read; a device file is closed again unread.
 */
const READ_FLAGS = constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOCTTY;

/** Outcome of {@link readRegularFile}. */
export type RegularFileRead =
  | { readonly kind: 'ok'; readonly data: Buffer; readonly stats: Stats }
  | { readonly kind: 'not-a-file' }
  | { readonly kind: 'too-large' };

/** Reads `handle` from its start to its end, or returns null as soon as more than `maxBytes` arrive. */
async function readAtMost(handle: FileHandle, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const chunk = Buffer.alloc(READ_CHUNK_BYTES);
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);
    if (bytesRead === 0) return Buffer.concat(chunks, total);
    total += bytesRead;
    if (total > maxBytes) return null;
    chunks.push(chunk.subarray(0, bytesRead));
  }
}

/**
 * Reads a regular file of at most `maxBytes` bytes. The type and size checks
 * and the read all go through one open handle, so the file cannot be swapped
 * (for a folder, a device or another file) between check and read, and a file
 * that grows after the size check is still refused once it exceeds the limit.
 * I/O errors such as `ENOENT` are thrown.
 */
export async function readRegularFile(path: string, maxBytes: number): Promise<RegularFileRead> {
  const handle = await open(path, READ_FLAGS);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return { kind: 'not-a-file' };
    if (stats.size > maxBytes) return { kind: 'too-large' };
    const data = await readAtMost(handle, maxBytes);
    return data === null ? { kind: 'too-large' } : { kind: 'ok', data, stats };
  } finally {
    await handle.close();
  }
}
