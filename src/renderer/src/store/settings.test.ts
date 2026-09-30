import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings } from '@shared/settings';
import { resetApp } from '@renderer/test/utils';
import type { FakeApi } from '@renderer/test/fakeApi';
import { mergeSettingsPatches, subscribeToSettingsChanges, useSettings } from './settings';
import { useUi } from './ui';

const settings = useSettings.getState;

describe('settings store', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
  });

  it('loads settings from the main process', async () => {
    api.state.settings = {
      ...DEFAULT_SETTINGS,
      general: { ...DEFAULT_SETTINGS.general, showWelcome: false },
    };
    await settings().load();
    expect(settings().loaded).toBe(true);
    expect(settings().settings.general.showWelcome).toBe(false);
  });

  it('falls back to defaults with a toast when loading fails', async () => {
    vi.mocked(api.settings.get).mockRejectedValueOnce(new Error('corrupt'));
    await settings().load();
    expect(settings().loaded).toBe(true);
    expect(settings().settings).toBe(DEFAULT_SETTINGS);
    expect(useUi.getState().toasts[0]).toMatchObject({ kind: 'error', detail: 'corrupt' });
  });

  it('applies updates optimistically and adopts the persisted result', async () => {
    const pending = settings().update({ appearance: { zoom: 1.5 } });
    expect(settings().settings.appearance.zoom).toBe(1.5);
    await expect(pending).resolves.toBe(true);
    expect(api.settings.set).toHaveBeenCalledWith({ appearance: { zoom: 1.5 } });
    expect(settings().settings).toBe(api.state.settings);
  });

  it('rejects invalid values without calling the main process', async () => {
    await expect(settings().update({ appearance: { zoom: 99 } })).resolves.toBe(false);
    expect(api.settings.set).not.toHaveBeenCalled();
    expect(useUi.getState().toasts[0]?.message).toBe('Invalid setting value.');
  });

  it('rolls back when persisting fails', async () => {
    vi.mocked(api.settings.set).mockRejectedValueOnce(new Error('disk full'));
    await expect(settings().update({ editor: { tabSize: 4 } })).resolves.toBe(false);
    expect(settings().settings.editor.tabSize).toBe(2);
    expect(useUi.getState().toasts[0]).toMatchObject({
      message: 'Could not save settings.',
      detail: 'disk full',
    });
  });

  it('restores a value pushed by another window when the last write fails', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    vi.mocked(api.settings.set).mockImplementationOnce(
      () => new Promise((_, reject) => (rejectFirst = reject)),
    );
    const first = settings().update({ editor: { tabSize: 4 } });
    settings().receive({ ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor, tabSize: 6 } });
    expect(settings().settings.editor.tabSize).toBe(4);
    rejectFirst(new Error('late'));
    await expect(first).resolves.toBe(false);
    expect(settings().settings.editor.tabSize).toBe(6);
  });

  it('ignores broadcasts while its own writes are in flight', async () => {
    let resolveWrite: (value: Settings) => void = () => undefined;
    vi.mocked(api.settings.set).mockImplementationOnce(
      () => new Promise((resolve) => (resolveWrite = resolve)),
    );
    const pending = settings().update({ editor: { tabSize: 3 } });
    const echo = { ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor, tabSize: 7 } };
    settings().receive(echo);
    expect(settings().settings.editor.tabSize).toBe(3);
    const persisted = { ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor, tabSize: 3 } };
    resolveWrite(persisted);
    await expect(pending).resolves.toBe(true);
    expect(settings().settings).toBe(persisted);
    settings().receive(echo);
    expect(settings().settings).toBe(echo);
  });

  it('coalesces rapid updates and never reverts to an echoed older value', async () => {
    const stop = subscribeToSettingsChanges();
    const seen: number[] = [];
    const unsubscribe = useSettings.subscribe((state) => seen.push(state.settings.appearance.zoom));
    const releases: (() => void)[] = [];
    // Like the main process: persist, broadcast to every window, then reply.
    vi.mocked(api.settings.set).mockImplementation(
      (patch) =>
        new Promise((resolve) => {
          releases.push(() => {
            api.state.settings = applySettingsPatch(api.state.settings, patch);
            api.emit.settingsChanged(api.state.settings);
            resolve(api.state.settings);
          });
        }),
    );
    const results = [1.2, 1.3, 1.4, 1.5].map((zoom) => settings().update({ appearance: { zoom } }));
    expect(api.settings.set).toHaveBeenCalledTimes(1);
    releases.shift()?.();
    await vi.waitFor(() => expect(api.settings.set).toHaveBeenCalledTimes(2));
    expect(api.settings.set).toHaveBeenLastCalledWith({ appearance: { zoom: 1.5 } });
    releases.shift()?.();
    await expect(Promise.all(results)).resolves.toEqual([true, true, true, true]);
    expect(seen).toEqual([1.2, 1.3, 1.4, 1.5, 1.5]);
    expect(settings().settings.appearance.zoom).toBe(1.5);
    unsubscribe();
    stop();
  });

  it('keeps the last persisted value when a coalesced write fails', async () => {
    const releases: ((ok: boolean) => void)[] = [];
    vi.mocked(api.settings.set).mockImplementation(
      (patch) =>
        new Promise((resolve, reject) => {
          releases.push((ok) => {
            if (!ok) {
              reject(new Error('disk full'));
              return;
            }
            api.state.settings = applySettingsPatch(api.state.settings, patch);
            resolve(api.state.settings);
          });
        }),
    );
    const first = settings().update({ editor: { tabSize: 4 } });
    const second = settings().update({ editor: { wordWrap: false } });
    const third = settings().update({ general: { showWelcome: false } });
    releases.shift()?.(true);
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    expect(api.settings.set).toHaveBeenLastCalledWith({
      editor: { wordWrap: false },
      general: { showWelcome: false },
    });
    releases.shift()?.(false);
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, false, false]);
    expect(settings().settings.editor).toMatchObject({ tabSize: 4, wordWrap: true });
    expect(settings().settings.general.showWelcome).toBe(true);
    expect(useUi.getState().toasts.at(-1)?.message).toBe('Could not save settings.');
  });

  it('does not overwrite a reset that happened while a write was in flight', async () => {
    let resolveWrite: (value: Settings) => void = () => undefined;
    vi.mocked(api.settings.set).mockImplementationOnce(
      () => new Promise((resolve) => (resolveWrite = resolve)),
    );
    const pending = settings().update({ editor: { tabSize: 5 } });
    await settings().reset();
    resolveWrite({ ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor, tabSize: 5 } });
    await pending;
    expect(settings().settings).toBe(DEFAULT_SETTINGS);
  });

  it('resets to defaults and reports failures', async () => {
    await settings().update({ editor: { tabSize: 4 } });
    await expect(settings().reset()).resolves.toBe(true);
    expect(settings().settings.editor.tabSize).toBe(2);
    vi.mocked(api.settings.reset).mockRejectedValueOnce(new Error('nope'));
    await expect(settings().reset()).resolves.toBe(false);
    expect(useUi.getState().toasts.at(-1)?.message).toBe('Could not reset settings.');
  });

  it('receives settings pushed by the main process', () => {
    const stop = subscribeToSettingsChanges();
    const next = { ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor, wordWrap: false } };
    api.emit.settingsChanged(next);
    expect(settings().settings).toBe(next);
    stop();
    expect(api.listenerCounts().settingsChanged).toBe(0);
  });
});

describe('mergeSettingsPatches', () => {
  it('merges sections field by field with later values winning', () => {
    expect(
      mergeSettingsPatches(
        { appearance: { zoom: 1.1, followSystem: false }, editor: { tabSize: 4 } },
        { appearance: { zoom: 1.3 }, general: { showWelcome: false } },
      ),
    ).toEqual({
      appearance: { zoom: 1.3, followSystem: false },
      editor: { tabSize: 4 },
      general: { showWelcome: false },
    });
    expect(mergeSettingsPatches({}, {})).toEqual({});
  });
});
