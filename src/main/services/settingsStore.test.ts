import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type SettingsPatch } from '../../shared/settings';
import { InvalidSettingsError, SettingsStore } from './settingsStore';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-settings-'));
  file = join(dir, 'settings.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('starts with defaults when no file exists', async () => {
    const store = new SettingsStore(file);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('loads tolerant of invalid values', async () => {
    await writeFile(file, JSON.stringify({ editor: { tabSize: 4, autoSave: 'always' } }));
    const store = new SettingsStore(file);
    const settings = await store.load();
    expect(settings.editor.tabSize).toBe(4);
    expect(settings.editor.autoSave).toBe('off');
  });

  it('applies, persists and broadcasts patches', async () => {
    const store = new SettingsStore(file);
    await store.load();
    const listener = vi.fn();
    const unsubscribe = store.onChange(listener);
    const next = await store.set({ appearance: { uiTheme: 'nord' } });
    expect(next.appearance.uiTheme).toBe('nord');
    expect(store.get()).toBe(next);
    expect(listener).toHaveBeenCalledWith(next);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(next);
    unsubscribe();
    await store.set({ appearance: { uiTheme: 'midnight' } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid patches with a readable error and keeps the current settings', async () => {
    const store = new SettingsStore(file);
    await store.load();
    const error: unknown = await store.set({ appearance: { zoom: 42 } }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(InvalidSettingsError);
    expect((error as Error).message).toMatch(/^Invalid settings: .*zoom/s);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('reports non-validation failures too', async () => {
    const store = new SettingsStore(file);
    const patch = {
      get appearance(): never {
        throw new TypeError('exploding getter');
      },
    } as unknown as SettingsPatch;
    await expect(store.set(patch)).rejects.toThrow('Invalid settings: TypeError: exploding getter');
  });

  it('serialises concurrent updates', async () => {
    const store = new SettingsStore(file);
    await Promise.all([store.set({ editor: { tabSize: 4 } }), store.set({ editor: { wordWrap: false } })]);
    expect(store.get().editor).toMatchObject({ tabSize: 4, wordWrap: false });
    const reloaded = new SettingsStore(file);
    expect((await reloaded.load()).editor).toMatchObject({ tabSize: 4, wordWrap: false });
  });

  it('reports when all scheduled updates have been applied', async () => {
    const store = new SettingsStore(file);
    const write = store.set({ rendering: { loadRemoteImages: true } });
    expect(store.get().rendering.loadRemoteImages).toBe(false);
    await store.whenIdle();
    expect(store.get().rendering.loadRemoteImages).toBe(true);
    await write;
    await expect(store.whenIdle()).resolves.toBeUndefined();
  });

  it('resets to defaults', async () => {
    const store = new SettingsStore(file);
    await store.set({ general: { showOutline: true } });
    expect(await store.reset()).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(DEFAULT_SETTINGS);
  });
});
