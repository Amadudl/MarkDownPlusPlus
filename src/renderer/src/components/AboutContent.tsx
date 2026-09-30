import type { JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import { getApi } from '@renderer/platform/api';
import { toastError, useUi } from '@renderer/store/ui';
import { LogoMark } from './common/LogoMark';
import { PROJECT_LINKS } from './links';

function openLink(url: string): void {
  getApi()
    .app.openExternal(url)
    .catch((error: unknown) => toastError('Could not open the link.', error));
}

/** Product information: version, runtime versions, links and license note. */
export function AboutContent(): JSX.Element {
  const info = useUi((state) => state.appInfo);
  return (
    <div className="about">
      <div className="about-hero">
        <LogoMark size={56} />
        <div>
          <p className="about-name">{info?.name ?? 'MarkDown++'}</p>
          <p className="about-version">
            Version {info?.version ?? '—'}
            {info?.isPortable === true ? ' · Portable' : ''}
          </p>
        </div>
      </div>
      <p className="about-tagline">
        A modern, cross-platform Markdown editor with first-class visual editing.
      </p>
      {info !== null && (
        <dl className="about-details">
          <div>
            <dt>Electron</dt>
            <dd>{info.electron}</dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>{info.chrome}</dd>
          </div>
          <div>
            <dt>Node.js</dt>
            <dd>{info.node}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{info.platform}</dd>
          </div>
        </dl>
      )}
      <div className="about-links">
        <button type="button" className="button" onClick={() => openLink(PROJECT_LINKS.repository)}>
          <ExternalLink size={14} aria-hidden="true" /> Source code
        </button>
        <button type="button" className="button" onClick={() => openLink(PROJECT_LINKS.issues)}>
          <ExternalLink size={14} aria-hidden="true" /> Report an issue
        </button>
        <button type="button" className="button" onClick={() => openLink(PROJECT_LINKS.license)}>
          <ExternalLink size={14} aria-hidden="true" /> License
        </button>
        <button type="button" className="button" onClick={() => openLink(PROJECT_LINKS.thirdPartyLicenses)}>
          <ExternalLink size={14} aria-hidden="true" /> Third-party licenses
        </button>
      </div>
      <p className="about-license">
        Free and open-source software under the MIT License — use, modify and share it freely. It builds on
        open-source packages whose licenses are included with the app.
      </p>
    </div>
  );
}
