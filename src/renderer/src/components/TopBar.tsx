import type { JSX } from 'react';
import { PanelTopClose, PanelTopOpen, Search, Settings } from 'lucide-react';
import { CommandId } from '@shared/commands';
import { executeCommand, shortcutLabel } from '@renderer/commands';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { IconButton } from './common/IconButton';
import { ModeSwitch } from './ModeSwitch';
import { TabStrip } from './TabStrip';

/**
 * Slim custom title bar: tabs on the left, the mode switch and global actions
 * on the right. On macOS it leaves room for the traffic lights and acts as the
 * window drag region.
 */
export function TopBar(): JSX.Element {
  const platform = useUi((state) => state.platform);
  const toolbarCollapsed = useUi((state) => state.toolbarCollapsed);
  const hasDocuments = useDocuments((state) => state.documents.length > 0);

  return (
    <header className="topbar">
      <TabStrip />
      <div className="topbar-actions">
        {hasDocuments && (
          <IconButton
            label={toolbarCollapsed ? 'Show formatting toolbar' : 'Hide formatting toolbar'}
            icon={toolbarCollapsed ? PanelTopOpen : PanelTopClose}
            pressed={!toolbarCollapsed}
            onClick={() => useUi.getState().setToolbarCollapsed(!toolbarCollapsed)}
          />
        )}
        <IconButton
          label="Command palette"
          icon={Search}
          shortcut={shortcutLabel(CommandId.ViewCommandPalette, platform)}
          onClick={() => void executeCommand(CommandId.ViewCommandPalette)}
        />
        <ModeSwitch />
        <IconButton
          label="Settings"
          icon={Settings}
          shortcut={shortcutLabel(CommandId.SettingsOpen, platform)}
          tooltipPlacement="left"
          onClick={() => void executeCommand(CommandId.SettingsOpen)}
        />
      </div>
    </header>
  );
}
