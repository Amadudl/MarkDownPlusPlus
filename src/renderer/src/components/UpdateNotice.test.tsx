import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeUpdate, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp } from '@renderer/test/utils';
import { useUpdate, type UpdateNoticeState } from '@renderer/store/update';
import { formatMegabytes, INSTALL_HINTS, UpdateNotice } from './UpdateNotice';

let api: FakeApi;

beforeEach(() => {
  api = resetApp();
});

function show(notice: UpdateNoticeState): HTMLElement {
  act(() => useUpdate.getState().show(notice));
  return screen.getByRole('region', { name: 'Software update' });
}

describe('UpdateNotice', () => {
  it('renders nothing without a notice', () => {
    const { container } = render(<UpdateNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a newer version with release notes, install and later', async () => {
    const update = fakeUpdate();
    render(<UpdateNotice />);
    const notice = show({ kind: 'available', update });
    expect(within(notice).getByText('Version 1.1.0 is available')).toBeInTheDocument();
    expect(within(notice).getByText(/You have version 1\.0\.0\./)).toBeInTheDocument();
    expect(within(notice).getByText(INSTALL_HINTS.installer)).toBeInTheDocument();

    await userEvent.click(within(notice).getByRole('button', { name: 'Release notes' }));
    expect(api.app.openExternal).toHaveBeenCalledWith(update.releaseUrl);

    await userEvent.click(within(notice).getByRole('button', { name: 'Download and install (120.0 MB)' }));
    expect(api.update.install).toHaveBeenCalledWith('1.1.0');
    expect(await screen.findByText('Installing version 1.1.0…')).toBeInTheDocument();
    expect(screen.getByText(/closes now and starts again/)).toBeInTheDocument();
    // An install that is finishing cannot be dismissed.
    expect(screen.queryByRole('button', { name: 'Close update notice' })).not.toBeInTheDocument();
  });

  it('hides when the user picks Later or closes it', async () => {
    render(<UpdateNotice />);
    const notice = show({ kind: 'available', update: fakeUpdate() });
    await userEvent.click(within(notice).getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('region', { name: 'Software update' })).not.toBeInTheDocument();
    show({ kind: 'checking' });
    expect(screen.getByText('Checking for updates…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close update notice' }));
    expect(useUpdate.getState().notice).toBeNull();
  });

  it('sends installations that cannot update themselves to the download page', async () => {
    api.state.updateOutcome = 'release-page-opened';
    render(<UpdateNotice />);
    const notice = show({
      kind: 'available',
      update: fakeUpdate({ installMode: 'manual', downloadSize: null }),
    });
    expect(within(notice).getByText(INSTALL_HINTS.manual)).toBeInTheDocument();
    await userEvent.click(within(notice).getByRole('button', { name: 'Open download page' }));
    expect(api.update.install).toHaveBeenCalledWith('1.1.0');
    expect(screen.queryByRole('region', { name: 'Software update' })).not.toBeInTheDocument();
  });

  it('shows the download progress and the verification', () => {
    const update = fakeUpdate();
    render(<UpdateNotice />);
    show({ kind: 'downloading', update, receivedBytes: 30 * 1024 * 1024, totalBytes: 120 * 1024 * 1024 });
    expect(screen.getByText('Downloading version 1.1.0…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Download progress' })).toHaveAttribute('value', '25');
    expect(screen.getByText('25 % · 30.0 MB of 120.0 MB')).toBeInTheDocument();
    show({ kind: 'downloading', update, receivedBytes: 0, totalBytes: 0 });
    expect(screen.getByRole('progressbar', { name: 'Download progress' })).toHaveAttribute('value', '0');
    show({ kind: 'verifying', update });
    expect(screen.getByText('Verifying the download…')).toBeInTheDocument();
    expect(screen.getByText(/SHA-256 checksum/)).toBeInTheDocument();
  });

  it('confirms an up-to-date app and an opened disk image', async () => {
    render(<UpdateNotice />);
    show({ kind: 'up-to-date', currentVersion: '1.0.5' });
    expect(screen.getByText('MarkDown++ is up to date')).toBeInTheDocument();
    expect(screen.getByText('Version 1.0.5 is the latest version.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(useUpdate.getState().notice).toBeNull();

    show({ kind: 'disk-image-opened', update: fakeUpdate({ installMode: 'disk-image' }) });
    expect(screen.getByText('Version 1.1.0 is ready')).toBeInTheDocument();
    expect(screen.getByText(/drag the new MarkDown\+\+ into the Applications folder/)).toBeInTheDocument();
  });

  it('shows errors with a way to the download page', async () => {
    const update = fakeUpdate();
    render(<UpdateNotice />);
    show({ kind: 'error', title: 'The update failed', message: 'checksum mismatch', update });
    expect(screen.getByText('The update failed')).toBeInTheDocument();
    expect(screen.getByText('checksum mismatch')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open download page' }));
    expect(api.app.openExternal).toHaveBeenCalledWith(update.releaseUrl);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUpdate.getState().notice).toBeNull();
  });

  it('formats sizes in megabytes', () => {
    expect(formatMegabytes(0)).toBe('0.0 MB');
    expect(formatMegabytes(114_138_491)).toBe('108.9 MB');
  });
});
