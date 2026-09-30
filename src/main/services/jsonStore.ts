import { readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { writeFileAtomic, writeFileAtomicSync } from './atomicWrite';

/** Upper bound for application state files; anything larger is treated as corrupt. */
const MAX_STATE_FILE_BYTES = 20 * 1024 * 1024;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Reads and parses a JSON state file. Returns `undefined` when the file does not
 * exist, is unreadable, too large or not valid JSON: callers validate the shape
 * and fall back to defaults, so a corrupt file never prevents the app from starting.
 */
export async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
  return text.length > MAX_STATE_FILE_BYTES ? undefined : parseJson(text);
}

/** Synchronous variant of {@link readJsonFile}. */
export function readJsonFileSync(filePath: string): unknown {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
  return text.length > MAX_STATE_FILE_BYTES ? undefined : parseJson(text);
}

/** Serialises `value` as pretty-printed JSON and writes it atomically, creating parent folders. */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Synchronous variant of {@link writeJsonFile}. Errors are propagated to the caller. */
export function writeJsonFileSync(filePath: string, value: unknown): void {
  writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Runs asynchronous tasks strictly one after another. Used to serialise writes
 * to the same state file so that a slow write can never overtake a newer one.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Schedules `task` after all previously scheduled tasks and resolves with its result. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
