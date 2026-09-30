import { useEffect, useState, type JSX } from 'react';
import { BookOpen, FilePlus, FileText, FolderOpen } from 'lucide-react';
import { CommandId, type CommandIdValue } from '@shared/commands';
import type { RecentFile } from '@shared/types';
import {
  createNewDocument,
  openPath,
  openTutorial,
  openWithDialog,
} from '@renderer/commands/documentActions';
import { getApi } from '@renderer/platform/api';
import { basename, dirname } from '@renderer/platform/paths';
import { useSettings } from '@renderer/store/settings';
import { toastError, useUi } from '@renderer/store/ui';
import { ShortcutKbd } from './common/Kbd';
import { LogoMark } from './common/LogoMark';

/** Keyboard shortcuts worth knowing, shown as a plain reference list. */
const HINTS: readonly { readonly id: CommandIdValue; readonly label: string }[] = [
  { id: CommandId.ViewCommandPalette, label: 'Command palette' },
  { id: CommandId.ViewToggleMode, label: 'Visual / Markdown' },
  { id: CommandId.SettingsOpen, label: 'Settings & themes' },
  { id: CommandId.HelpShortcuts, label: 'All shortcuts' },
];

const MAX_RECENT = 6;

/** Start screen shown when no document is open. */
export function WelcomeScreen(): JSX.Element {
  const platform = useUi((state) => state.platform);
  const showWelcome = useSettings((state) => state.settings.general.showWelcome);
  const [recent, setRecent] = useState<readonly RecentFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .recent.get()
      .then((files) => {
        if (!cancelled) setRecent(files.slice(0, MAX_RECENT));
      })
      .catch((error: unknown) => toastError('Could not load recent files.', error));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-hero">
          <LogoMark size={72} />
          <h1 className="welcome-title">MarkDown++</h1>
          <p className="welcome-tagline">Write beautiful Markdown — visually, or right in the source.</p>
        </div>
        <div className="welcome-actions">
          <button type="button" className="welcome-action" onClick={() => createNewDocument()}>
            <FilePlus size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="welcome-action-label">New document</span>
            <ShortcutKbd command={CommandId.FileNew} platform={platform} />
          </button>
          <button type="button" className="welcome-action" onClick={() => void openWithDialog()}>
            <FolderOpen size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="welcome-action-label">Open file…</span>
            <ShortcutKbd command={CommandId.FileOpen} platform={platform} />
          </button>
          <button type="button" className="welcome-action" onClick={() => openTutorial()}>
            <BookOpen size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="welcome-action-label">Open the tutorial</span>
            <span className="welcome-action-hint">2 min</span>
          </button>
        </div>
        {recent.length > 0 && (
          <section className="welcome-section" aria-labelledby="welcome-recent">
            <h2 id="welcome-recent" className="welcome-section-title">
              Recent
            </h2>
            <ul className="welcome-recent">
              {recent.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className="welcome-recent-item"
                    title={file.path}
                    onClick={() => void openPath(file.path)}
                  >
                    <FileText size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span className="welcome-recent-name">{basename(file.path)}</span>
                    <span className="welcome-recent-dir">{dirname(file.path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="welcome-section" aria-labelledby="welcome-hints">
          <h2 id="welcome-hints" className="welcome-section-title">
            Good to know
          </h2>
          <ul className="welcome-hints">
            {HINTS.map((hint) => (
              <li key={hint.id}>
                <span>{hint.label}</span>
                <ShortcutKbd command={hint.id} platform={platform} />
              </li>
            ))}
            <li className="welcome-hint-note">Drop .md files anywhere to open them</li>
          </ul>
        </section>
        <label className="welcome-startup">
          <input
            type="checkbox"
            checked={showWelcome}
            onChange={(event) =>
              void useSettings.getState().update({ general: { showWelcome: event.target.checked } })
            }
          />
          Show this screen when no document is open at startup
        </label>
      </div>
    </div>
  );
}
