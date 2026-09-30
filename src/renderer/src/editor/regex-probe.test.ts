import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultProbeWorker,
  createRegexProbe,
  type ProbeWorker,
  REGEX_PROBE_BUDGET_MS,
  REGEX_PROBE_STARTUP_MS,
  type RegexProbeRequest,
  type RegexProbeResponse,
  runRegexProbe,
} from './regex-probe';
import type { SearchQuery } from './types';

const regex = (text: string): SearchQuery => ({ text, caseSensitive: false, wholeWord: false, regexp: true });

class FakeWorker implements ProbeWorker {
  onmessage: ((event: MessageEvent<RegexProbeResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: RegexProbeRequest[] = [];
  terminated = false;

  postMessage(message: RegexProbeRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(elapsedMs: number, id = this.posted.at(-1)?.id ?? 0): void {
    this.onmessage?.(new MessageEvent('message', { data: { id, elapsedMs } }));
  }
}

function probeWith() {
  const workers: FakeWorker[] = [];
  const probe = createRegexProbe(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { probe, workers, worker: () => workers.at(-1) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runRegexProbe', () => {
  it('runs the whole search and reports the elapsed time', () => {
    const times = [10, 25];
    const response = runRegexProbe(
      { id: 7, source: 'a+', flags: 'gu', text: 'a aa b aaa', limit: 100 },
      () => times.shift() ?? 0,
    );
    expect(response).toEqual({ id: 7, elapsedMs: 15 });
  });

  it('stops at the match limit and skips empty matches', () => {
    const response = runRegexProbe({ id: 1, source: 'a*', flags: 'gu', text: 'baaab'.repeat(10), limit: 3 });
    expect(response.id).toBe(1);
    expect(response.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('createRegexProbe', () => {
  it('accepts plain text, empty documents and invalid or empty patterns without a worker', async () => {
    const { probe, workers } = probeWith();
    await expect(probe.check({ ...regex('a+'), regexp: false }, 'aaa')).resolves.toBe('ok');
    await expect(probe.check(regex('a+'), '')).resolves.toBe('ok');
    await expect(probe.check(regex('a['), 'aaa')).resolves.toBe('ok');
    await expect(probe.check(regex(''), 'aaa')).resolves.toBe('ok');
    expect(workers).toHaveLength(0);
  });

  it('sends the compiled expression and accepts fast searches', async () => {
    const { probe, worker, workers } = probeWith();
    const verdict = probe.check({ ...regex('b+'), caseSensitive: true }, 'abba');
    const posted = worker()?.posted[0];
    expect(posted).toMatchObject({ source: 'b+', flags: 'gu', text: 'abba' });
    worker()?.respond(REGEX_PROBE_BUDGET_MS - 1, (posted?.id ?? 0) + 1000);
    worker()?.respond(REGEX_PROBE_BUDGET_MS - 1);
    await expect(verdict).resolves.toBe('ok');
    // The worker is reused.
    const second = probe.check(regex('c'), 'ccc');
    worker()?.respond(1);
    await expect(second).resolves.toBe('ok');
    expect(workers).toHaveLength(1);
  });

  it('refuses searches over the budget', async () => {
    const { probe, worker } = probeWith();
    const verdict = probe.check(regex('a+b'), 'aaaa');
    worker()?.respond(REGEX_PROBE_BUDGET_MS + 1);
    await expect(verdict).resolves.toBe('too-slow');
  });

  it('terminates a hung worker and starts a new one for the next check', async () => {
    vi.useFakeTimers();
    const { probe, workers } = probeWith();
    const verdict = probe.check(regex('(a|aa)+$'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab');
    vi.advanceTimersByTime(REGEX_PROBE_BUDGET_MS + REGEX_PROBE_STARTUP_MS);
    await expect(verdict).resolves.toBe('too-slow');
    expect(workers[0]?.terminated).toBe(true);
    const next = probe.check(regex('a'), 'a');
    expect(workers).toHaveLength(2);
    workers[1]?.respond(1);
    await expect(next).resolves.toBe('ok');
  });

  it('cancels a running check when a newer one starts', async () => {
    const { probe, workers } = probeWith();
    const first = probe.check(regex('a'), 'aaa');
    const second = probe.check(regex('aa'), 'aaa');
    await expect(first).resolves.toBe('cancelled');
    expect(workers[0]?.terminated).toBe(true);
    workers[1]?.respond(2);
    await expect(second).resolves.toBe('ok');
  });

  it('resolves pending checks as cancelled on dispose', async () => {
    const { probe, worker } = probeWith();
    const verdict = probe.check(regex('a'), 'aaa');
    probe.dispose();
    await expect(verdict).resolves.toBe('cancelled');
    expect(worker()?.terminated).toBe(true);
    probe.dispose();
  });

  it('does not block searches when the worker fails, but logs the failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { probe, worker } = probeWith();
    const verdict = probe.check(regex('a'), 'aaa');
    worker()?.onerror?.(new ErrorEvent('error', { message: 'load failed' }));
    await expect(verdict).resolves.toBe('ok');
    expect(error).toHaveBeenCalledWith('The regular expression probe failed', 'load failed');
    expect(worker()?.terminated).toBe(true);
  });

  it('accepts every query where workers are unavailable', async () => {
    const probe = createRegexProbe(() => null);
    await expect(probe.check(regex('a+'), 'aaa')).resolves.toBe('ok');
  });
});

describe('createDefaultProbeWorker', () => {
  it('returns null without Worker support', () => {
    vi.stubGlobal('Worker', undefined);
    expect(createDefaultProbeWorker()).toBeNull();
  });

  it('starts the bundled module worker', () => {
    const constructed: { url: string; options: WorkerOptions | undefined }[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor(url: URL, options?: WorkerOptions) {
          constructed.push({ url: url.href, options });
        }

        terminate(): void {
          /* never started */
        }
      },
    );
    expect(createDefaultProbeWorker()).not.toBeNull();
    expect(constructed[0]?.url).toMatch(/regex-probe\.worker\.ts/);
    expect(constructed[0]?.options).toEqual({ type: 'module', name: 'mpp-regex-probe' });
  });
});
