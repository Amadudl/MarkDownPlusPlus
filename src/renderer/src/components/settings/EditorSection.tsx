import type { JSX } from 'react';
import {
  CUSTOM_WIDTH_MAX,
  CUSTOM_WIDTH_MIN,
  type EditorSettings,
  type EditorWidthMode,
  type SettingsPatch,
} from '@shared/settings';
import { setWidthMode } from '@renderer/commands/viewActions';
import { useSettings } from '@renderer/store/settings';
import { NumberField, Segmented, SelectField, SettingRow, Toggle } from './controls';
import { SourceFontField } from './SourceFontField';

/** Help text of the editor width setting for each mode. */
export const WIDTH_MODE_DESCRIPTIONS: Readonly<Record<EditorWidthMode, string>> = {
  theme: 'Text column width of Visual and Markdown mode. Theme uses the content width of the element style.',
  full: 'The text uses the whole width of the window. Toggle it any time with View → Full Width.',
  custom: 'The text column is as wide as you set below. Exports always use the element style width.',
};

/** Settings → Editor. */
export function EditorSection(): JSX.Element {
  const editor = useSettings((state) => state.settings.editor);
  const update = (patch: SettingsPatch): Promise<boolean> => useSettings.getState().update(patch);
  const set = (patch: Partial<EditorSettings>): void => void update({ editor: patch });

  return (
    <div className="settings-section">
      <SettingRow label="Default mode" description="The view new and opened documents start in.">
        <Segmented<EditorSettings['defaultMode']>
          label="Default mode"
          value={editor.defaultMode}
          choices={[
            { value: 'wysiwyg', label: 'Visual' },
            { value: 'source', label: 'Markdown' },
          ]}
          onChange={(defaultMode) => set({ defaultMode })}
        />
      </SettingRow>
      <SettingRow label="Editor width" description={WIDTH_MODE_DESCRIPTIONS[editor.widthMode]}>
        <Segmented<EditorWidthMode>
          label="Editor width"
          value={editor.widthMode}
          choices={[
            { value: 'theme', label: 'Theme' },
            { value: 'full', label: 'Full' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(widthMode) => void setWidthMode(widthMode)}
        />
      </SettingRow>
      {editor.widthMode === 'custom' && (
        <SettingRow
          label="Custom width"
          description="Maximum width of the text column; it never gets wider than the window."
          htmlFor="editor-custom-width"
        >
          <NumberField
            id="editor-custom-width"
            label="Custom width"
            value={editor.customWidth}
            min={CUSTOM_WIDTH_MIN}
            max={CUSTOM_WIDTH_MAX}
            step={20}
            unit="px"
            slider
            onChange={(customWidth) => set({ customWidth })}
          />
        </SettingRow>
      )}
      <SettingRow label="Source font" description="Font of the Markdown source editor." htmlFor="editor-font">
        <SourceFontField
          id="editor-font"
          value={editor.sourceFontFamily}
          onChange={(sourceFontFamily) => set({ sourceFontFamily })}
        />
      </SettingRow>
      <SettingRow label="Source font size" htmlFor="editor-font-size">
        <NumberField
          id="editor-font-size"
          label="Source font size"
          value={editor.sourceFontSize}
          min={8}
          max={40}
          unit="px"
          slider
          onChange={(sourceFontSize) => set({ sourceFontSize })}
        />
      </SettingRow>
      <SettingRow label="Line numbers" description="Show line numbers in the Markdown source editor.">
        <Toggle
          label="Line numbers"
          checked={editor.sourceLineNumbers}
          onChange={(sourceLineNumbers) => set({ sourceLineNumbers })}
        />
      </SettingRow>
      <SettingRow label="Word wrap" description="Wrap long lines in the source editor.">
        <Toggle label="Word wrap" checked={editor.wordWrap} onChange={(wordWrap) => set({ wordWrap })} />
      </SettingRow>
      <SettingRow label="Spell checking">
        <Toggle
          label="Spell checking"
          checked={editor.spellcheck}
          onChange={(spellcheck) => set({ spellcheck })}
        />
      </SettingRow>
      <SettingRow label="Tab size" htmlFor="editor-tab-size">
        <NumberField
          id="editor-tab-size"
          label="Tab size"
          value={editor.tabSize}
          min={1}
          max={8}
          unit="spaces"
          onChange={(tabSize) => set({ tabSize })}
        />
      </SettingRow>
      <SettingRow
        label="Auto save"
        description="Only applies to documents that were saved before."
        htmlFor="editor-autosave"
      >
        <SelectField<EditorSettings['autoSave']>
          id="editor-autosave"
          value={editor.autoSave}
          choices={[
            { value: 'off', label: 'Off' },
            { value: 'afterDelay', label: 'After a delay' },
            { value: 'onFocusChange', label: 'When the window loses focus' },
          ]}
          onChange={(autoSave) => set({ autoSave })}
        />
      </SettingRow>
      {editor.autoSave === 'afterDelay' && (
        <SettingRow label="Auto save delay" htmlFor="editor-autosave-delay">
          <NumberField
            id="editor-autosave-delay"
            label="Auto save delay"
            value={editor.autoSaveDelayMs}
            min={500}
            max={60_000}
            step={100}
            unit="ms"
            onChange={(autoSaveDelayMs) => set({ autoSaveDelayMs })}
          />
        </SettingRow>
      )}
      <SettingRow label="Line endings of new files" htmlFor="editor-eol">
        <SelectField<EditorSettings['newLineEnding']>
          id="editor-eol"
          value={editor.newLineEnding}
          choices={[
            { value: 'system', label: 'System default' },
            { value: 'lf', label: 'LF (macOS, Linux)' },
            { value: 'crlf', label: 'CRLF (Windows)' },
          ]}
          onChange={(newLineEnding) => set({ newLineEnding })}
        />
      </SettingRow>
      <SettingRow
        label="Restore session"
        description="Reopen the files that were open last time, even after a crash or restart."
      >
        <Toggle
          label="Restore session"
          checked={editor.restoreSession}
          onChange={(restoreSession) => set({ restoreSession })}
        />
      </SettingRow>
    </div>
  );
}
