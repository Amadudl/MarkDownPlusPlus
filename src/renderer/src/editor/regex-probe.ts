import type { SearchQuery } from './types';
import { compileSearchQuery, MAX_SEARCH_MATCHES } from './wysiwyg/search-matcher';

/**
 * Off-main-thread timing check of regular expression searches.
 *
 * Both editors search synchronously on the renderer's main thread, so a
 * pattern that backtracks catastrophically on the current document would
 * freeze the window (and a frozen renderer cannot answer the close handshake,
 * which loses unsaved work). Before a regular expression query reaches an
 * editor, the find bar runs it over the document text in a Web Worker: a
 * worker that exceeds the time budget is terminated and the query is refused.
 * Structural hazards (nested repetition) are additionally rejected by
 * `compileSearchQuery` in both editors, which also covers later edits.
 */

/** Longest time the whole-document search may take in the worker before the query is refused. */
export const REGEX_PROBE_BUDGET_MS = 250;
/** Extra time granted for starting the worker before a probe is abandoned as hung. */
export const REGEX_PROBE_STARTUP_MS = 1_000;

/** Shown when a regular expression is refused because it is too slow for the document. */
export const REGEX_TOO_SLOW_ERROR = 'This regular expression is too slow for this document';

/** Message sent to the probe worker. */
export interface RegexProbeRequest {
  readonly id: number;
  readonly source: string;
  readonly flags: string;
  readonly text: string;
  readonly limit: number;
}

/** Answer of the probe worker. */
export interface RegexProbeResponse {
  readonly id: number;
  /** Time the search took inside the worker. */
  readonly elapsedMs: number;
}

/** Outcome of {@link RegexProbe.check}; `cancelled` when a newer check superseded it. */
export type RegexProbeVerdict = 'ok' | 'too-slow' | 'cancelled';

/** The subset of the `Worker` API the probe uses (injectable for tests). */
export interface ProbeWorker {
  onmessage: ((event: MessageEvent<RegexProbeResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: RegexProbeRequest): void;
  terminate(): void;
}

/** Creates a probe worker, or returns null where workers are unavailable. */
export type ProbeWorkerFactory = () => ProbeWorker | null;

/** Runs a probe request: the full search the editors would run. Executed inside the worker. */
export function runRegexProbe(
  request: RegexProbeRequest,
  now: () => number = () => performance.now(),
): RegexProbeResponse {
  const started = now();
  const regexp = new RegExp(request.source, request.flags);
  let count = 0;
  for (const match of request.text.matchAll(regexp)) {
    if (match[0] !== '') count += 1;
    if (count >= request.limit) break;
  }
  return { id: request.id, elapsedMs: now() - started };
}

/** The production worker (bundled by Vite as a separate module worker). */
export const createDefaultProbeWorker: ProbeWorkerFactory = () =>
  typeof Worker === 'undefined'
    ? null
    : new Worker(new URL('./regex-probe.worker.ts', import.meta.url), {
        type: 'module',
        name: 'mpp-regex-probe',
      });

/** Checks regular expression queries against a document before they run on the main thread. */
export interface RegexProbe {
  /**
   * Resolves `ok` for queries that are safe to run on `text` (plain text,
   * empty and invalid queries are always `ok`: the editors report syntax
   * errors themselves), `too-slow` when the search exceeds the budget, and
   * `cancelled` when a newer check started first.
   */
  check(query: SearchQuery, text: string): Promise<RegexProbeVerdict>;
  /** Terminates the worker; pending checks resolve `cancelled`. */
  dispose(): void;
}

interface Pending {
  readonly id: number;
  readonly settle: (verdict: RegexProbeVerdict) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Creates a {@link RegexProbe}. One worker is reused while it is healthy; it
 * is terminated (and recreated on demand) when a probe hangs or is superseded
 * while running, which is the only way to stop a runaway regular expression.
 */
export function createRegexProbe(
  createWorker: ProbeWorkerFactory = createDefaultProbeWorker,
  budgetMs = REGEX_PROBE_BUDGET_MS,
  startupMs = REGEX_PROBE_STARTUP_MS,
): RegexProbe {
  let worker: ProbeWorker | null = null;
  let pending: Pending | null = null;
  let nextId = 1;

  const stopWorker = (): void => {
    worker?.terminate();
    worker = null;
  };

  const finish = (verdict: RegexProbeVerdict): void => {
    const current = pending;
    if (current === null) return;
    pending = null;
    clearTimeout(current.timer);
    current.settle(verdict);
  };

  const workerFor = (): ProbeWorker | null => {
    if (worker !== null) return worker;
    const created = createWorker();
    if (created === null) return null;
    created.onmessage = (event) => {
      if (pending?.id === event.data.id) finish(event.data.elapsedMs > budgetMs ? 'too-slow' : 'ok');
    };
    created.onerror = (event) => {
      console.error('The regular expression probe failed', event.message);
      stopWorker();
      finish('ok');
    };
    worker = created;
    return created;
  };

  return {
    check(query, text) {
      if (pending !== null) {
        // The superseded search may still be running; only terminating the worker stops it.
        stopWorker();
        finish('cancelled');
      }
      if (!query.regexp || text === '') return Promise.resolve('ok');
      const compiled = compileSearchQuery(query);
      if (!compiled.ok || compiled.search === null) return Promise.resolve('ok');
      const probeWorker = workerFor();
      if (probeWorker === null) return Promise.resolve('ok');
      const { regexp } = compiled.search;
      const id = nextId;
      nextId += 1;
      return new Promise<RegexProbeVerdict>((settle) => {
        const timer = setTimeout(() => {
          stopWorker();
          finish('too-slow');
        }, budgetMs + startupMs);
        pending = { id, settle, timer };
        probeWorker.postMessage({
          id,
          source: regexp.source,
          flags: regexp.flags,
          text,
          limit: MAX_SEARCH_MATCHES,
        });
      });
    },
    dispose() {
      stopWorker();
      finish('cancelled');
    },
  };
}
