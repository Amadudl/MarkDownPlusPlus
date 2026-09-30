import { useState, type JSX } from 'react';
import { Copy, Download } from 'lucide-react';
import type { UiTheme } from '@shared/theme-model';
import { listUiThemes, resolveTheme } from '@renderer/themes';
import type { SettingsPatch } from '@shared/settings';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { ColorThemeEditor, UI_COLOR_GROUPS, UI_CONTRAST_PAIRS } from './ColorThemeEditor';
import { NumberField, SelectField, SettingRow, Toggle } from './controls';
import { ImportThemeButton } from './ImportThemeButton';
import { UiThemeCard } from './ThemeCard';
import {
  applyUiThemeNow,
  deleteCustomUiTheme,
  downloadTheme,
  duplicateUiTheme,
  isBuiltinUiTheme,
  isDeferredUiThemePick,
  saveCustomUiTheme,
  selectUiTheme,
} from './themeActions';

/** Settings → Appearance: colour schemes, system appearance, zoom and the custom theme editor. */
export function AppearanceSection(): JSX.Element {
  const settings = useSettings((state) => state.settings);
  const update = (patch: SettingsPatch): Promise<boolean> => useSettings.getState().update(patch);
  const prefersDark = useUi((state) => state.prefersDark);
  const { appearance } = settings;
  const themes = listUiThemes(settings);
  const active = resolveTheme(settings, prefersDark).ui;
  /** A theme picked for the other appearance: stored, but not what is on screen now. */
  const [deferred, setDeferred] = useState<UiTheme | null>(null);
  const pending = deferred !== null && isDeferredUiThemePick(deferred, appearance.followSystem, prefersDark);

  const onSelect = async (theme: UiTheme): Promise<void> => {
    await selectUiTheme(theme);
    setDeferred(isDeferredUiThemePick(theme, appearance.followSystem, prefersDark) ? theme : null);
  };

  const badgesFor = (theme: UiTheme): string[] => {
    const badges: string[] = [];
    if (!isBuiltinUiTheme(theme.id)) badges.push('Custom');
    if (appearance.followSystem) {
      if (theme.id === appearance.lightTheme) badges.push('Used in light mode');
      if (theme.id === appearance.darkTheme) badges.push('Used in dark mode');
    } else if (theme.id === appearance.uiTheme) badges.push('Active');
    return badges;
  };

  const isSelected = (theme: UiTheme): boolean =>
    appearance.followSystem
      ? theme.id === appearance.lightTheme || theme.id === appearance.darkTheme
      : theme.id === appearance.uiTheme;

  const choices = themes.map((theme) => ({ value: theme.id, label: theme.name }));
  const gallery = (kind: UiTheme['kind'], title: string): JSX.Element => (
    <section className="settings-block" aria-label={title}>
      <h4 className="settings-block-title">{title}</h4>
      {pending && deferred.kind === kind && (
        <div className="settings-notice" role="status">
          <p className="settings-notice-text">
            {deferred.name} will be used when your system is in {kind} mode.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setDeferred(null);
              void applyUiThemeNow(deferred);
            }}
          >
            Use it now
          </button>
        </div>
      )}
      <div className="theme-grid">
        {themes
          .filter((theme) => theme.kind === kind)
          .map((theme) => (
            <UiThemeCard
              key={theme.id}
              theme={theme}
              selected={isSelected(theme)}
              badges={badgesFor(theme)}
              onSelect={() => void onSelect(theme)}
            />
          ))}
      </div>
    </section>
  );

  return (
    <div className="settings-section">
      <SettingRow
        label="Follow system appearance"
        description="Switch automatically between a light and a dark scheme."
      >
        <Toggle
          label="Follow system appearance"
          checked={appearance.followSystem}
          onChange={(followSystem) => void update({ appearance: { followSystem } })}
        />
      </SettingRow>
      {appearance.followSystem ? (
        <>
          <SettingRow label="Light scheme" htmlFor="appearance-light">
            <SelectField
              id="appearance-light"
              value={appearance.lightTheme}
              choices={choices}
              onChange={(lightTheme) => void update({ appearance: { lightTheme } })}
            />
          </SettingRow>
          <SettingRow label="Dark scheme" htmlFor="appearance-dark">
            <SelectField
              id="appearance-dark"
              value={appearance.darkTheme}
              choices={choices}
              onChange={(darkTheme) => void update({ appearance: { darkTheme } })}
            />
          </SettingRow>
        </>
      ) : (
        <SettingRow label="Colour scheme" htmlFor="appearance-theme">
          <SelectField
            id="appearance-theme"
            value={appearance.uiTheme}
            choices={choices}
            onChange={(uiTheme) => void update({ appearance: { uiTheme } })}
          />
        </SettingRow>
      )}
      <SettingRow label="Zoom" description="Scales the whole window." htmlFor="appearance-zoom">
        <NumberField
          id="appearance-zoom"
          label="Zoom"
          value={Math.round(appearance.zoom * 100)}
          min={50}
          max={300}
          step={10}
          unit="%"
          slider
          onChange={(percent) => void update({ appearance: { zoom: percent / 100 } })}
        />
      </SettingRow>
      {/* The gallery for the current appearance first: its picks change the screen right away. */}
      {prefersDark ? gallery('dark', 'Dark schemes') : gallery('light', 'Light schemes')}
      {prefersDark ? gallery('light', 'Light schemes') : gallery('dark', 'Dark schemes')}
      <section className="settings-block" aria-label="Customize">
        <h4 className="settings-block-title">Customize “{active.name}”</h4>
        <div className="settings-inline-actions">
          <button type="button" className="button" onClick={() => void duplicateUiTheme(active)}>
            <Copy size={14} aria-hidden="true" /> Duplicate
          </button>
          <button type="button" className="button" onClick={() => downloadTheme(active)}>
            <Download size={14} aria-hidden="true" /> Export JSON
          </button>
          <ImportThemeButton />
        </div>
        {isBuiltinUiTheme(active.id) ? (
          <p className="setting-description">
            Built-in schemes are read-only. Duplicate one to edit every colour.
          </p>
        ) : (
          <ColorThemeEditor
            theme={active}
            groups={UI_COLOR_GROUPS}
            contrastPairs={UI_CONTRAST_PAIRS}
            onSave={(theme) => void saveCustomUiTheme(theme)}
            onDelete={() => void deleteCustomUiTheme(active.id)}
          />
        )}
      </section>
    </div>
  );
}
