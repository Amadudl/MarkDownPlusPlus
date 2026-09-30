import { z } from 'zod';
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  parseSettings,
  type Settings,
  type SettingsPatch,
} from '../../shared/settings';
import { readJsonFile, SerialQueue, writeJsonFile } from './jsonStore';

/** Thrown by {@link SettingsStore.set} when a patch would produce invalid settings. */
export class InvalidSettingsError extends Error {
  constructor(details: string) {
    super(`Invalid settings: ${details}`);
    this.name = 'InvalidSettingsError';
  }
}

type SettingsListener = (settings: Settings) => void;

/**
 * Persists the user settings in `settings.json`. Loading is tolerant (invalid
 * sections fall back to defaults); updates are validated strictly and written
 * atomically, one at a time.
 */
export class SettingsStore {
  private current: Settings = DEFAULT_SETTINGS;
  private readonly listeners = new Set<SettingsListener>();
  private readonly queue = new SerialQueue();

  constructor(private readonly filePath: string) {}

  /** Loads the settings file (missing or corrupt files yield defaults). */
  async load(): Promise<Settings> {
    this.current = parseSettings(await readJsonFile(this.filePath));
    return this.current;
  }

  /** The settings currently in effect. */
  get(): Settings {
    return this.current;
  }

  /**
   * Applies a partial update, persists it and notifies listeners.
   * @throws InvalidSettingsError if the resulting settings do not validate.
   */
  set(patch: SettingsPatch): Promise<Settings> {
    return this.queue.run(async () => {
      let next: Settings;
      try {
        next = applySettingsPatch(this.current, patch);
      } catch (error) {
        throw new InvalidSettingsError(error instanceof z.ZodError ? z.prettifyError(error) : String(error));
      }
      return this.commit(next);
    });
  }

  /** Resolves once every update scheduled so far has been applied (or has failed). */
  whenIdle(): Promise<void> {
    return this.queue.run(() => Promise.resolve());
  }

  /** Restores the defaults. */
  reset(): Promise<Settings> {
    return this.queue.run(() => this.commit(DEFAULT_SETTINGS));
  }

  /** Subscribes to changes; returns an unsubscribe function. */
  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async commit(next: Settings): Promise<Settings> {
    await writeJsonFile(this.filePath, next);
    this.current = next;
    for (const listener of this.listeners) listener(next);
    return next;
  }
}
