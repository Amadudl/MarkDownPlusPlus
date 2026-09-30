import { useEffect, useRef } from 'react';
import { bindMenuCommands, registerDefaultCommands } from '@renderer/commands';
import { startAutoSave } from '@renderer/commands/autosave';
import { startFileWatching } from '@renderer/commands/fileWatching';
import { bindAppEvents, startup } from '@renderer/commands/session';
import { startAppearanceSync, startWindowTitleSync } from '@renderer/commands/windowSync';
import { applyPlatformClass } from '@renderer/platform/platform';
import { subscribeToSettingsChanges } from '@renderer/store/settings';
import { toastError, useUi, watchSystemColorScheme } from '@renderer/store/ui';

/**
 * Wires the shell to the main process for the lifetime of the app: commands,
 * menu, OS events, file watching, auto save, window title and appearance, then
 * runs the startup sequence.
 */
export function useAppLifecycle(): void {
  const platform = useUi((state) => state.platform);
  const started = useRef(false);

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
    if (!started.current) {
      started.current = true;
      startup().catch((error: unknown) => toastError('Startup failed.', error));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);
}
