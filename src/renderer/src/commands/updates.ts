import type { UpdateInfo } from '@shared/types';
import { getApi } from '@renderer/platform/api';
import { errorMessage, toastError } from '@renderer/store/ui';
import { isUpdateBusy, noticeUpdate, useUpdate } from '@renderer/store/update';

/** Release page opened when no update details are known (e.g. after a failed check). */
export const RELEASES_URL = 'https://github.com/Amadudl/MarkDownPlusPlus/releases/latest';

/**
 * Help → Check for Updates: asks the main process for the latest release and
 * shows the result (newer version, up to date, or the error) in the update notice.
 * Does nothing while an update is being installed.
 */
export async function checkForUpdates(): Promise<void> {
  if (isUpdateBusy(useUpdate.getState().notice)) return;
  useUpdate.getState().show({ kind: 'checking' });
  try {
    const result = await getApi().update.check();
    useUpdate
      .getState()
      .show(
        result.status === 'available'
          ? { kind: 'available', update: result.update }
          : { kind: 'up-to-date', currentVersion: result.currentVersion },
      );
  } catch (error) {
    useUpdate.getState().show({
      kind: 'error',
      title: 'Could not check for updates',
      message: errorMessage(error),
      update: null,
    });
  }
}

/**
 * Installs the update shown in the notice: the main process downloads and
 * verifies it, then restarts the app, opens the disk image (macOS) or opens the
 * release page (installations that cannot update themselves).
 */
export async function installUpdate(): Promise<void> {
  const { notice } = useUpdate.getState();
  if (notice?.kind !== 'available') return;
  const { update } = notice;
  if (update.installMode !== 'manual') {
    useUpdate
      .getState()
      .show({ kind: 'downloading', update, receivedBytes: 0, totalBytes: update.downloadSize ?? 0 });
  }
  try {
    const outcome = await getApi().update.install(update.version);
    if (outcome === 'release-page-opened') {
      useUpdate.getState().dismiss();
    } else {
      useUpdate
        .getState()
        .show({ kind: outcome === 'restarting' ? 'restarting' : 'disk-image-opened', update });
    }
  } catch (error) {
    useUpdate
      .getState()
      .show({ kind: 'error', title: 'The update failed', message: errorMessage(error), update });
  }
}

/** Opens the release notes and downloads of `update` (or the latest release) in the browser. */
export async function openReleasePage(update: UpdateInfo | null): Promise<void> {
  try {
    await getApi().app.openExternal(update?.releaseUrl ?? RELEASES_URL);
  } catch (error) {
    toastError('Could not open the release page.', error);
  }
}

/**
 * Shows updates found by the background check at startup and the progress of
 * a running install.
 * @returns an unsubscribe function.
 */
export function bindUpdateEvents(): () => void {
  const api = getApi();
  const offAvailable = api.update.onAvailable((update) => {
    const { notice } = useUpdate.getState();
    // Never replace an install in progress or a result the user is looking at.
    if (notice !== null && notice.kind !== 'checking') return;
    useUpdate.getState().show({ kind: 'available', update });
  });
  const offProgress = api.update.onProgress((progress) => {
    const update = noticeUpdate(useUpdate.getState().notice);
    if (progress.phase === 'cancelled') {
      useUpdate
        .getState()
        .show({ kind: 'error', title: 'Update not finished', message: progress.message, update });
      return;
    }
    if (update === null) return;
    if (progress.phase === 'verifying') {
      useUpdate.getState().show({ kind: 'verifying', update });
    } else {
      useUpdate.getState().show({
        kind: 'downloading',
        update,
        receivedBytes: progress.receivedBytes,
        totalBytes: progress.totalBytes,
      });
    }
  });
  return () => {
    offAvailable();
    offProgress();
  };
}
