import type { JSX, ReactNode } from 'react';
import { CircleAlert, CircleCheck, Download, LoaderCircle, X } from 'lucide-react';
import type { UpdateInfo, UpdateInstallMode } from '@shared/types';
import { installUpdate, openReleasePage } from '@renderer/commands/updates';
import { useUpdate, type UpdateNoticeState } from '@renderer/store/update';

/** Formats a byte count as megabytes with one decimal (`114.1 MB`). */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What happens when the user installs an update, per install mode. */
export const INSTALL_HINTS: Readonly<Record<UpdateInstallMode, string>> = {
  installer:
    'MarkDown++ downloads the update, closes (asking about unsaved changes), installs it and starts again.',
  'disk-image':
    'MarkDown++ downloads the update and opens the disk image. Then quit MarkDown++ and drag the new version into the Applications folder.',
  appimage: 'MarkDown++ downloads the update, replaces this AppImage and starts again.',
  manual: 'This installation cannot update itself. Download the new version from the release page.',
};

interface NoticeContent {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: ReactNode;
  readonly actions: ReactNode;
  readonly dismissible: boolean;
}

function ReleaseNotesLink({ update }: { readonly update: UpdateInfo }): JSX.Element {
  return (
    <button type="button" className="update-notice-link" onClick={() => void openReleasePage(update)}>
      Release notes
    </button>
  );
}

function spinner(): ReactNode {
  return <LoaderCircle className="update-notice-icon is-spinning" size={18} aria-hidden="true" />;
}

function contentOf(notice: UpdateNoticeState, dismiss: () => void): NoticeContent {
  const done = (
    <button type="button" className="button button-primary" onClick={dismiss}>
      OK
    </button>
  );
  switch (notice.kind) {
    case 'checking':
      return {
        icon: spinner(),
        title: 'Checking for updates…',
        body: null,
        actions: null,
        dismissible: true,
      };
    case 'up-to-date':
      return {
        icon: <CircleCheck className="update-notice-icon" size={18} aria-hidden="true" />,
        title: 'MarkDown++ is up to date',
        body: <p>Version {notice.currentVersion} is the latest version.</p>,
        actions: done,
        dismissible: true,
      };
    case 'available': {
      const { update } = notice;
      const size = update.downloadSize === null ? '' : ` (${formatMegabytes(update.downloadSize)})`;
      return {
        icon: <Download className="update-notice-icon" size={18} aria-hidden="true" />,
        title: `Version ${update.version} is available`,
        body: (
          <>
            <p>
              You have version {update.currentVersion}. <ReleaseNotesLink update={update} />
            </p>
            <p className="update-notice-hint">{INSTALL_HINTS[update.installMode]}</p>
          </>
        ),
        actions: (
          <>
            <button type="button" className="button button-primary" onClick={() => void installUpdate()}>
              {update.installMode === 'manual' ? 'Open download page' : `Download and install${size}`}
            </button>
            <button type="button" className="button" onClick={dismiss}>
              Later
            </button>
          </>
        ),
        dismissible: true,
      };
    }
    case 'downloading': {
      const percent =
        notice.totalBytes > 0
          ? Math.min(100, Math.floor((notice.receivedBytes * 100) / notice.totalBytes))
          : 0;
      return {
        icon: spinner(),
        title: `Downloading version ${notice.update.version}…`,
        body: (
          <>
            <progress
              className="update-notice-progress"
              aria-label="Download progress"
              max={100}
              value={percent}
            />
            <p className="update-notice-hint">
              {percent} % · {formatMegabytes(notice.receivedBytes)} of {formatMegabytes(notice.totalBytes)}
            </p>
          </>
        ),
        actions: null,
        dismissible: false,
      };
    }
    case 'verifying':
      return {
        icon: spinner(),
        title: 'Verifying the download…',
        body: <p>Comparing its SHA-256 checksum with the one published on GitHub.</p>,
        actions: null,
        dismissible: false,
      };
    case 'restarting':
      return {
        icon: spinner(),
        title: `Installing version ${notice.update.version}…`,
        body: <p>MarkDown++ closes now and starts again when the update is installed.</p>,
        actions: null,
        dismissible: false,
      };
    case 'disk-image-opened':
      return {
        icon: <CircleCheck className="update-notice-icon" size={18} aria-hidden="true" />,
        title: `Version ${notice.update.version} is ready`,
        body: (
          <p>
            The disk image is open. Quit MarkDown++, drag the new MarkDown++ into the Applications folder,
            replace the old version and start it again.
          </p>
        ),
        actions: done,
        dismissible: true,
      };
    case 'error':
      return {
        icon: <CircleAlert className="update-notice-icon is-error" size={18} aria-hidden="true" />,
        title: notice.title,
        body: <p>{notice.message}</p>,
        actions: (
          <>
            <button type="button" className="button" onClick={() => void openReleasePage(notice.update)}>
              Open download page
            </button>
            <button type="button" className="button button-primary" onClick={dismiss}>
              Close
            </button>
          </>
        ),
        dismissible: true,
      };
  }
}

/**
 * Non-modal card that reports update checks and installs: a newer version
 * with its release notes, download progress, "up to date" after a manual check
 * and errors. Rendered above the status bar; it never blocks editing.
 */
export function UpdateNotice(): JSX.Element | null {
  const notice = useUpdate((state) => state.notice);
  if (notice === null) return null;
  const dismiss = (): void => useUpdate.getState().dismiss();
  const content = contentOf(notice, dismiss);
  return (
    <section
      className="update-notice"
      aria-label="Software update"
      aria-live="polite"
      data-kind={notice.kind}
    >
      {content.icon}
      <div className="update-notice-body">
        <p className="update-notice-title">{content.title}</p>
        {content.body}
        {content.actions !== null && <div className="update-notice-actions">{content.actions}</div>}
      </div>
      {content.dismissible && (
        <button
          type="button"
          className="update-notice-dismiss"
          aria-label="Close update notice"
          onClick={dismiss}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
