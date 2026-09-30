import { create } from 'zustand';
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings';
import { getApi } from '@renderer/platform/api';
import { toastError } from './ui';

export interface SettingsState {
  readonly settings: Settings;
  /** True once the persisted settings were loaded from the main process. */
  readonly loaded: boolean;
  /** Loads the persisted settings. Falls back to defaults (with a toast) on failure. */
  load(): Promise<void>;
  /**
   * Applies a patch optimistically and persists it. Patches made while a write is in
   * flight are coalesced into one follow-up write. When the chain settles the persisted
   * value is adopted; on failure the last persisted settings are restored (unless another
   * change happened meanwhile) and an error toast is shown.
   * @returns true when the change was persisted.
   */
  update(patch: SettingsPatch): Promise<boolean>;
  /** Restores the factory defaults. */
  reset(): Promise<boolean>;
  /**
   * Replaces the settings with a value pushed by the main process. Ignored while this
   * window has writes in flight (the broadcast is an echo or older than the reply).
   */
  receive(settings: Settings): void;
}

/** Patch sections that may be merged into one write (every section except `version`). */
const PATCH_SECTIONS = ['appearance', 'rendering', 'editor', 'general'] as const;

/** Merges `next` over `base` section by section (later values win), like two consecutive writes. */
export function mergeSettingsPatches(base: SettingsPatch, next: SettingsPatch): SettingsPatch {
  const merged: { -readonly [K in keyof SettingsPatch]: SettingsPatch[K] } = { ...base };
  for (const section of PATCH_SECTIONS) {
    const value = next[section];
    if (value === undefined) continue;
    // The spread keeps each section's own type; TypeScript cannot correlate the union key.
    Object.assign(merged, { [section]: { ...base[section], ...value } });
  }
  return merged;
}

interface PendingWrite {
  patch: SettingsPatch;
  readonly waiters: ((persisted: boolean) => void)[];
}

/**
 * Write pipeline shared by every `update()` call of this window. At most one write is in
 * flight; patches arriving meanwhile are coalesced into a single follow-up write, so a
 * dragged slider or colour picker never floods the main process with full settings writes.
 */
const sync: {
  /** True while a write chain is running. */
  writing: boolean;
  /** Patches waiting for the in-flight write to finish. */
  queued: PendingWrite | null;
  /** The newest optimistic value this window produced. */
  optimistic: Settings | null;
  /** The newest value known to be persisted (or the state before the chain started). */
  confirmed: Settings;
  /** A broadcast that arrived while writing; only relevant when the final write fails. */
  deferred: Settings | null;
} = { writing: false, queued: null, optimistic: null, confirmed: DEFAULT_SETTINGS, deferred: null };

/** Application settings mirrored from the main process. */
export const useSettings = create<SettingsState>()((set, get) => {
  const drain = async (): Promise<void> => {
    sync.writing = true;
    let lastOk = false;
    const settled: { readonly waiters: PendingWrite['waiters']; readonly ok: boolean }[] = [];
    while (sync.queued !== null) {
      const batch = sync.queued;
      sync.queued = null;
      try {
        sync.confirmed = await getApi().settings.set(batch.patch);
        // Broadcasts are sent before the reply, so anything received so far is older.
        sync.deferred = null;
        lastOk = true;
      } catch (error) {
        lastOk = false;
        toastError('Could not save settings.', error);
      }
      settled.push({ waiters: batch.waiters, ok: lastOk });
    }
    sync.writing = false;
    if (get().settings === sync.optimistic) {
      set({ settings: lastOk ? sync.confirmed : (sync.deferred ?? sync.confirmed) });
    }
    sync.deferred = null;
    sync.optimistic = null;
    for (const { waiters, ok } of settled) for (const resolve of waiters) resolve(ok);
  };

  return {
    settings: DEFAULT_SETTINGS,
    loaded: false,

    async load() {
      try {
        const settings = await getApi().settings.get();
        set({ settings, loaded: true });
      } catch (error) {
        set({ loaded: true });
        toastError('Could not load settings; using defaults.', error);
      }
    },

    update(patch) {
      const current = get().settings;
      let optimistic: Settings;
      try {
        optimistic = applySettingsPatch(current, patch);
      } catch (error) {
        toastError('Invalid setting value.', error);
        return Promise.resolve(false);
      }
      if (!sync.writing) {
        sync.confirmed = current;
        sync.deferred = null;
      }
      sync.optimistic = optimistic;
      set({ settings: optimistic });
      return new Promise<boolean>((resolve) => {
        if (sync.queued === null) sync.queued = { patch, waiters: [resolve] };
        else {
          sync.queued.patch = mergeSettingsPatches(sync.queued.patch, patch);
          sync.queued.waiters.push(resolve);
        }
        if (!sync.writing) void drain();
      });
    },

    async reset() {
      try {
        const settings = await getApi().settings.reset();
        set({ settings });
        return true;
      } catch (error) {
        toastError('Could not reset settings.', error);
        return false;
      }
    },

    receive(settings) {
      // While this window writes, pushed values are echoes of (or older than) its own
      // writes; applying them would revert newer optimistic state. The write's reply wins.
      if (sync.writing) sync.deferred = settings;
      else set({ settings });
    },
  };
});

/**
 * Subscribes to settings pushed by the main process (e.g. changed in another window).
 * @returns an unsubscribe function.
 */
export function subscribeToSettingsChanges(): () => void {
  return getApi().settings.onChanged((settings) => useSettings.getState().receive(settings));
}
