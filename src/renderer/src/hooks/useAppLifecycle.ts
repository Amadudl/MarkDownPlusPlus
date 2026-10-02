import { useEffect, useRef } from 'react';
import { bindMenuCommands, registerDefaultCommands } from '@renderer/commands';
import { startAutoSave } from '@renderer/commands/autosave';
import { startFileWatching } from '@renderer/commands/fileWatching';
import { bindAppEvents, startSessionPersistence, startup } from '@renderer/commands/session';
import { startAppearanceSync, startWindowTitleSync } from '@renderer/commands/windowSync';
import { applyPlatformClass } from '@renderer/platform/platform';
import { subscribeToSettingsChanges } from '@renderer/store/settings';
import { toastError, useUi, watchSystemColorScheme } from '@renderer/store/ui';

/**
 * Wires the shell to the main process for the lifetime of the app: commands,
 * menu, OS events, file watching, auto save, window title and appearance, then
 * runs the startup sequence and keeps the session persisted.
 */
export function useAppLifecycle(): void {
  const platform = useUi((state) => state.platform);
  const startupRun = useRef<Promise<void> | null>(null);

  useEffect(() => {
    applyPlatformClass(platform);
  }, [platform]);

  useEffect(() => {
    registerDefaultCommands();
    const cleanups = [
      watchSystemColorScheme(),
      startAppearanceSync(),
      subscribeToSettingsChanges(),
      bindMenuCommands(),
      bindAppEvents(),
      startFileWatching(),
      startAutoSave(),
      startWindowTitleSync(),
    ];
    // The startup sequence runs once, even when React re-runs this effect (StrictMode),
    // and only after every listener above is bound. The session is persisted continuously
    // once startup has restored the previous one.
    startupRun.current ??= startup().catch((error: unknown) => toastError('Startup failed.', error));
    cleanups.push(startSessionPersistence(startupRun.current));
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);
}
