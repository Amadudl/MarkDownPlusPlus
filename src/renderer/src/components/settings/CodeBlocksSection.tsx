import type { CSSProperties, JSX } from 'react';
import { Copy, Download, Sparkles } from 'lucide-react';
import type { CodeTheme } from '@shared/theme-model';
import { listCodeThemes, resolveTheme, themeToCssVariables, type ResolvedTheme } from '@renderer/themes';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { CODE_COLOR_GROUPS, CODE_CONTRAST_PAIRS, ColorThemeEditor } from './ColorThemeEditor';
import { SettingRow, Toggle } from './controls';
import { ImportThemeButton } from './ImportThemeButton';
import { CodeSample } from './samples';
import { ThemeCardCaption } from './ThemeCard';
import {
  AUTO_CODE_THEME,
  deleteCustomCodeTheme,
  downloadTheme,
  duplicateCodeTheme,
  isBuiltinCodeTheme,
  saveCustomCodeTheme,
  selectCodeTheme,
  setCodeThemeFlag,
} from './themeActions';

/** Only the `--mpp-code-*` variables of a theme trio with the given code theme. */
export function codeVariables(resolved: ResolvedTheme, code: CodeTheme): CSSProperties {
  const variables = themeToCssVariables({ ...resolved, code });
  return Object.fromEntries(Object.entries(variables).filter(([name]) => name.startsWith('--mpp-code-')));
}

function CodePreview({
  style,
  large = false,
}: {
  readonly style: CSSProperties;
  readonly large?: boolean;
}): JSX.Element {
  return (
    <span className={large ? 'code-preview is-large' : 'code-preview'} style={style} aria-hidden="true">
      <pre>
        <CodeSample />
      </pre>
    </span>
  );
}

/** Settings → Code Blocks: syntax themes for code blocks and the Markdown source editor. */
export function CodeBlocksSection(): JSX.Element {
  const settings = useSettings((state) => state.settings);
  const prefersDark = useUi((state) => state.prefersDark);
  const resolved = resolveTheme(settings, prefersDark);
  const selectedId = settings.rendering.codeTheme;
  const themes = listCodeThemes(settings);
  const effective = resolved.code;
  const autoMode = selectedId === AUTO_CODE_THEME;

  const card = (theme: CodeTheme): JSX.Element => {
    const selected = !autoMode && theme.id === selectedId;
    const badges = isBuiltinCodeTheme(theme.id) ? [] : ['Custom'];
    return (
      <button
        key={theme.id}
        type="button"
        className={selected ? 'theme-card is-selected' : 'theme-card'}
        aria-pressed={selected}
        aria-label={`${theme.name} (${theme.kind})`}
        title={theme.description === '' ? theme.name : theme.description}
        onClick={() => void selectCodeTheme(theme.id)}
      >
        <CodePreview style={codeVariables(resolved, theme)} />
        <ThemeCardCaption name={theme.name} badges={badges} />
      </button>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-hero-preview">
        <CodePreview style={codeVariables(resolved, effective)} large />
        <p className="setting-description">
          In use: <strong>{effective.name}</strong>
          {autoMode ? ' (matched to your colour scheme)' : ''}
        </p>
      </div>
      <section className="settings-block" aria-label="Automatic">
        <div className="theme-grid">
          <button
            type="button"
            className={autoMode ? 'theme-card theme-card-auto is-selected' : 'theme-card theme-card-auto'}
            aria-pressed={autoMode}
            aria-label="Auto (match UI theme)"
            onClick={() => void selectCodeTheme(AUTO_CODE_THEME)}
          >
            <span className="theme-card-auto-art" aria-hidden="true">
              <Sparkles size={22} strokeWidth={1.5} />
            </span>
            <ThemeCardCaption name="Auto (match UI theme)" badges={[]} />
          </button>
        </div>
      </section>
      <section className="settings-block" aria-label="Dark code themes">
        <h4 className="settings-block-title">Dark</h4>
        <div className="theme-grid">{themes.filter((theme) => theme.kind === 'dark').map(card)}</div>
      </section>
      <section className="settings-block" aria-label="Light code themes">
        <h4 className="settings-block-title">Light</h4>
        <div className="theme-grid">{themes.filter((theme) => theme.kind === 'light').map(card)}</div>
      </section>
      <section className="settings-block" aria-label="Style">
        <h4 className="settings-block-title">Style of “{effective.name}”</h4>
        <SettingRow label="Italic comments">
          <Toggle
            label="Italic comments"
            checked={effective.italicComments}
            onChange={(value) => void setCodeThemeFlag('italicComments', value)}
          />
        </SettingRow>
        <SettingRow label="Bold keywords">
          <Toggle
            label="Bold keywords"
            checked={effective.boldKeywords}
            onChange={(value) => void setCodeThemeFlag('boldKeywords', value)}
          />
        </SettingRow>
        <p className="setting-description">Changing a built-in theme creates a custom copy automatically.</p>
        <div className="settings-inline-actions">
          <button type="button" className="button" onClick={() => void duplicateCodeTheme(effective)}>
            <Copy size={14} aria-hidden="true" /> Duplicate
          </button>
          <button type="button" className="button" onClick={() => downloadTheme(effective)}>
            <Download size={14} aria-hidden="true" /> Export JSON
          </button>
          <ImportThemeButton />
        </div>
        {!isBuiltinCodeTheme(effective.id) && (
          <ColorThemeEditor
            theme={effective}
            groups={CODE_COLOR_GROUPS}
            contrastPairs={CODE_CONTRAST_PAIRS}
            onSave={(theme) => void saveCustomCodeTheme(theme)}
            onDelete={() => void deleteCustomCodeTheme(effective.id)}
          />
        )}
      </section>
    </div>
  );
}
