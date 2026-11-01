import { beforeEach, describe, expect, it } from 'vitest';
import { fakeUpdate as updateInfo, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp } from '@renderer/test/utils';
import { useUi } from '@renderer/store/ui';
import { isUpdateBusy, noticeUpdate, useUpdate } from '@renderer/store/update';
import { bindUpdateEvents, checkForUpdates, installUpdate, openReleasePage, RELEASES_URL } from './updates';

const notice = (): ReturnType<typeof useUpdate.getState>['notice'] => useUpdate.getState().notice;

let api: FakeApi;

beforeEach(() => {
  api = resetApp();
});

describe('checkForUpdates', () => {
  it('shows a newer version', async () => {
    const update = updateInfo();
    api.state.updateCheck = { status: 'available', update };
    const running = checkForUpdates();
    expect(notice()).toEqual({ kind: 'checking' });
    await running;
    expect(notice()).toEqual({ kind: 'available', update });
  });

  it('tells the user when the app is up to date', async () => {
    await checkForUpdates();
    expect(notice()).toEqual({ kind: 'up-to-date', currentVersion: '1.0.0' });
  });

  it('shows why a check failed', async () => {
    api.update.check = () => Promise.reject(new Error('The connection to api.github.com timed out.'));
    await checkForUpdates();
    expect(notice()).toEqual({
      kind: 'error',
      title: 'Could not check for updates',
      message: 'The connection to api.github.com timed out.',
      update: null,
    });
  });

  it('leaves an install in progress alone', async () => {
    const busy = { kind: 'verifying', update: updateInfo() } as const;
    useUpdate.getState().show(busy);
    await checkForUpdates();
    expect(api.update.check).not.toHaveBeenCalled();
    expect(notice()).toEqual(busy);
  });
});

describe('installUpdate', () => {
  it('downloads and reports that the app restarts', async () => {
    const update = updateInfo();
    useUpdate.getState().show({ kind: 'available', update });
    const running = installUpdate();
    expect(notice()).toEqual({
      kind: 'downloading',
      update,
      receivedBytes: 0,
      totalBytes: update.downloadSize,
    });
    await running;
    expect(api.update.install).toHaveBeenCalledWith('1.1.0');
    expect(notice()).toEqual({ kind: 'restarting', update });
  });

  it('reports the opened disk image on macOS', async () => {
    const update = updateInfo({ installMode: 'disk-image', downloadSize: null });
    api.state.updateOutcome = 'disk-image-opened';
    useUpdate.getState().show({ kind: 'available', update });
    const running = installUpdate();
    expect(notice()).toMatchObject({ kind: 'downloading', totalBytes: 0 });
    await running;
    expect(notice()).toEqual({ kind: 'disk-image-opened', update });
  });

  it('closes the notice once the release page was opened', async () => {
    const update = updateInfo({ installMode: 'manual', downloadSize: null });
    api.state.updateOutcome = 'release-page-opened';
    useUpdate.getState().show({ kind: 'available', update });
    const running = installUpdate();
    expect(notice()).toEqual({ kind: 'available', update });
    await running;
    expect(notice()).toBeNull();
  });

  it('shows a failed install with the update for the download page', async () => {
    const update = updateInfo();
    api.update.install = () => Promise.reject(new Error('checksum mismatch'));
    useUpdate.getState().show({ kind: 'available', update });
    await installUpdate();
    expect(notice()).toEqual({
      kind: 'error',
      title: 'The update failed',
      message: 'checksum mismatch',
      update,
    });
  });

  it('does nothing unless an update is offered', async () => {
    await installUpdate();
    useUpdate.getState().show({ kind: 'checking' });
    await installUpdate();
    expect(api.update.install).not.toHaveBeenCalled();
  });
});

describe('openReleasePage', () => {
  it('opens the page of the update or the latest release', async () => {
    await openReleasePage(updateInfo());
    expect(api.app.openExternal).toHaveBeenCalledWith(
      'https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v1.1.0',
    );
    await openReleasePage(null);
    expect(api.app.openExternal).toHaveBeenLastCalledWith(RELEASES_URL);
  });

  it('reports a page that cannot be opened', async () => {
    api.app.openExternal = () => Promise.reject(new Error('no browser'));
    await openReleasePage(null);
    expect(useUi.getState().toasts.at(-1)).toMatchObject({
      kind: 'error',
      message: 'Could not open the release page.',
      detail: 'no browser',
    });
  });
});

describe('bindUpdateEvents', () => {
  it('shows an update found at startup unless the user is looking at something else', () => {
    const stop = bindUpdateEvents();
    const update = updateInfo();
    api.emit.updateAvailable(update);
    expect(notice()).toEqual({ kind: 'available', update });

    useUpdate.getState().show({ kind: 'checking' });
    api.emit.updateAvailable(update);
    expect(notice()).toEqual({ kind: 'available', update });

    const failed = { kind: 'error', title: 'x', message: 'y', update: null } as const;
    useUpdate.getState().show(failed);
    api.emit.updateAvailable(updateInfo({ version: '2.0.0' }));
    expect(notice()).toEqual(failed);
    stop();
    useUpdate.getState().dismiss();
    api.emit.updateAvailable(update);
    expect(notice()).toBeNull();
  });

  it('follows the progress of an install', () => {
    const stop = bindUpdateEvents();
    const update = updateInfo();
    // Without an update on screen, progress has nothing to attach to.
    api.emit.updateProgress({ phase: 'verifying' });
    expect(notice()).toBeNull();

    useUpdate.getState().show({ kind: 'available', update });
    api.emit.updateProgress({ phase: 'downloading', receivedBytes: 10, totalBytes: 100 });
    expect(notice()).toEqual({ kind: 'downloading', update, receivedBytes: 10, totalBytes: 100 });
    api.emit.updateProgress({ phase: 'verifying' });
    expect(notice()).toEqual({ kind: 'verifying', update });
    api.emit.updateProgress({ phase: 'cancelled', message: 'MarkDown++ did not close.' });
    expect(notice()).toEqual({
      kind: 'error',
      title: 'Update not finished',
      message: 'MarkDown++ did not close.',
      update,
    });
    stop();
  });
});

describe('update notice state', () => {
  it('knows when an install is running and which update a notice is about', () => {
    const update = updateInfo();
    expect(isUpdateBusy(null)).toBe(false);
    expect(isUpdateBusy({ kind: 'available', update })).toBe(false);
    expect(isUpdateBusy({ kind: 'downloading', update, receivedBytes: 0, totalBytes: 1 })).toBe(true);
    expect(isUpdateBusy({ kind: 'verifying', update })).toBe(true);
    expect(isUpdateBusy({ kind: 'restarting', update })).toBe(true);
    expect(noticeUpdate(null)).toBeNull();
    expect(noticeUpdate({ kind: 'checking' })).toBeNull();
    expect(noticeUpdate({ kind: 'up-to-date', currentVersion: '1.0.0' })).toBeNull();
    expect(noticeUpdate({ kind: 'disk-image-opened', update })).toBe(update);
    expect(noticeUpdate({ kind: 'error', title: 't', message: 'm', update: null })).toBeNull();
  });
});
