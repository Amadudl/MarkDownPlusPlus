import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionState } from '../../shared/types';
import { SessionStore } from './sessionStore';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-session-'));
  file = join(dir, 'session.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SessionStore', () => {
  it('returns null without a session file', async () => {
    expect(await new SessionStore(file).load()).toBeNull();
  });

  it('saves and loads a session', async () => {
    const store = new SessionStore(file);
    const state: SessionState = {
      documents: [
        { path: '/a.md', mode: 'wysiwyg' },
        { path: '/b.md', mode: 'source' },
      ],
      activePath: '/b.md',
    };
    await store.save(state);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(state);
    expect(await store.load()).toEqual(state);
  });

  it('ignores invalid session files', async () => {
    await writeFile(
      file,
      JSON.stringify({ documents: [{ path: 'relative.md', mode: 'wysiwyg' }], activePath: null }),
    );
    expect(await new SessionStore(file).load()).toBeNull();
  });

  it('treats only documents of the session found at startup as restorable', async () => {
    await writeFile(
      file,
      JSON.stringify({ documents: [{ path: '/Docs/A.md', mode: 'wysiwyg' }], activePath: null }),
    );
    const store = new SessionStore(file, 'linux');
    expect(store.isRestorable('/Docs/A.md')).toBe(false);
    await store.captureStartupSession();
    expect(store.isRestorable('/Docs/A.md')).toBe(true);
    expect(store.isRestorable('/docs/a.md')).toBe(false);
    // Documents written to the file later are not restorable.
    await store.save({ documents: [{ path: '/home/u/.zshrc', mode: 'source' }], activePath: null });
    expect(store.isRestorable('/home/u/.zshrc')).toBe(false);
  });

  it('compares restorable paths case-insensitively on Windows and captures nothing without a file', async () => {
    const empty = new SessionStore(file);
    await empty.captureStartupSession();
    expect(empty.isRestorable('/a.md')).toBe(false);
    await writeFile(
      file,
      JSON.stringify({ documents: [{ path: '/Docs/A.md', mode: 'source' }], activePath: null }),
    );
    const windows = new SessionStore(file, 'win32');
    await windows.captureStartupSession();
    expect(windows.isRestorable('/docs/a.md')).toBe(true);
  });

  it('refuses to save invalid state', async () => {
    const store = new SessionStore(file);
    const invalid = {
      documents: [{ path: '/a.md', mode: 'preview' }],
      activePath: null,
    } as unknown as SessionState;
    await expect(store.save(invalid)).rejects.toThrow();
    expect(await store.load()).toBeNull();
  });
});
