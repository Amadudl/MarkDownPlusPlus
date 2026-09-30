import type { JSX } from 'react';
import { Minimize2 } from 'lucide-react';
import { AboutDialog } from './components/AboutDialog';
import { CommandPalette } from './components/CommandPalette';
import { DropOverlay } from './components/DropOverlay';
import { EditorArea } from './components/EditorArea';
import { FindBar } from './components/FindBar';
import { Outline } from './components/Outline';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { useFileDrop } from './hooks/useFileDrop';
import { useDocuments } from './store/documents';
import { useSettings } from './store/settings';
import { useUi } from './store/ui';

/** Root component: the application shell. */
export function App(): JSX.Element {
  useAppLifecycle();
  useFileDrop();
  const hasDocuments = useDocuments((state) => state.documents.length > 0);
  const focusMode = useUi((state) => state.focusMode);
  const outlineVisible = useUi((state) => state.outlineVisible);
  const toolbarCollapsed = useUi((state) => state.toolbarCollapsed);
  const dialog = useUi((state) => state.dialog);
  const showStatusBar = useSettings((state) => state.settings.general.showStatusBar);

  return (
    <div className={focusMode ? 'app is-focus-mode' : 'app'}>
      <TopBar />
      {hasDocuments && !toolbarCollapsed && !focusMode && <Toolbar />}
      <div className="app-body">
        {hasDocuments && outlineVisible && !focusMode && <Outline />}
        <main className="app-main">
          {hasDocuments ? (
            <>
              <FindBar />
              <EditorArea />
            </>
          ) : (
            <WelcomeScreen />
          )}
        </main>
      </div>
      {showStatusBar && !focusMode && <StatusBar />}
      {focusMode && (
        <button
          type="button"
          className="focus-exit button"
          onClick={() => useUi.getState().toggleFocusMode()}
        >
          <Minimize2 size={14} aria-hidden="true" /> Exit focus mode
        </button>
      )}
      <CommandPalette />
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'about' && <AboutDialog />}
      <DropOverlay />
      <Toasts />
    </div>
  );
}
