import type { JSX } from 'react';
import type { SettingsPatch } from '@shared/settings';
import { useSettings } from '@renderer/store/settings';
import { SettingRow, Toggle } from './controls';

/** Settings → General. */
export function GeneralSection(): JSX.Element {
  const general = useSettings((state) => state.settings.general);
  const loadRemoteImages = useSettings((state) => state.settings.rendering.loadRemoteImages);
  const update = (patch: SettingsPatch): Promise<boolean> => useSettings.getState().update(patch);

  return (
    <div className="settings-section">
      <SettingRow
        label="Confirm before closing unsaved documents"
        description="Ask whether to save, discard or cancel."
      >
        <Toggle
          label="Confirm before closing unsaved documents"
          checked={general.confirmOnClose}
          onChange={(confirmOnClose) => void update({ general: { confirmOnClose } })}
        />
      </SettingRow>
      <SettingRow label="Show welcome screen" description="Shown at startup when no document is open.">
        <Toggle
          label="Show welcome screen"
          checked={general.showWelcome}
          onChange={(showWelcome) => void update({ general: { showWelcome } })}
        />
      </SettingRow>
      <SettingRow label="Show status bar">
        <Toggle
          label="Show status bar"
          checked={general.showStatusBar}
          onChange={(showStatusBar) => void update({ general: { showStatusBar } })}
        />
      </SettingRow>
      <SettingRow
        label="Load remote images"
        description="Allow images from https:// addresses. Off by default: a remote image tells its server when and from where you opened the document. Local images always load."
      >
        <Toggle
          label="Load remote images"
          checked={loadRemoteImages}
          onChange={(value) => void update({ rendering: { loadRemoteImages: value } })}
        />
      </SettingRow>
    </div>
  );
}
