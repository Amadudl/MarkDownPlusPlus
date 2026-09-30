import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readJsonFile, readJsonFileSync, SerialQueue, writeJsonFile, writeJsonFileSync } from './jsonStore';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-json-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('JSON state files', () => {
  it('round-trips values and creates parent folders', async () => {
    const file = join(dir, 'nested', 'deeper', 'state.json');
    await writeJsonFile(file, { a: [1, 2], b: 'x' });
    expect(await readFile(file, 'utf8')).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": "x"\n}\n');
    expect(await readJsonFile(file)).toEqual({ a: [1, 2], b: 'x' });
    expect(readJsonFileSync(file)).toEqual({ a: [1, 2], b: 'x' });
  });

  it('returns undefined for missing, corrupt or oversized files', async () => {
    const corrupt = join(dir, 'corrupt.json');
    await writeFile(corrupt, '{ nope');
    const huge = join(dir, 'huge.json');
    await writeFile(huge, `"${'x'.repeat(20 * 1024 * 1024 + 1)}"`);
    for (const file of [join(dir, 'missing.json'), corrupt, huge]) {
      expect(await readJsonFile(file)).toBeUndefined();
      expect(readJsonFileSync(file)).toBeUndefined();
    }
  });

  it('writes synchronously', () => {
    const file = join(dir, 'sync.json');
    writeJsonFileSync(file, { ok: true });
    expect(readJsonFileSync(file)).toEqual({ ok: true });
  });
});

describe('SerialQueue', () => {
  it('runs tasks strictly in order, even after failures', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.run(async () => {
      await gate;
      order.push('first');
      return 1;
    });
    const failing = queue.run(() => {
      order.push('second');
      return Promise.reject(new Error('boom'));
    });
    const third = queue.run(() => {
      order.push('third');
      return Promise.resolve(3);
    });
    release();
    await expect(first).resolves.toBe(1);
    await expect(failing).rejects.toThrow('boom');
    await expect(third).resolves.toBe(3);
    expect(order).toEqual(['first', 'second', 'third']);
  });
});
