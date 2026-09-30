import type { CSSProperties, ReactNode, JSX } from 'react';
import type { UiTheme } from '@shared/theme-model';

/** Inline preview variables derived from a theme's own colour data. */
function previewStyle(theme: UiTheme): CSSProperties {
  const c = theme.colors;
  return {
    '--preview-background': c.background,
    '--preview-surface': c.surface,
    '--preview-sunken': c.surfaceSunken,
    '--preview-border': c.border,
    '--preview-editor': c.editorBackground,
    '--preview-text': c.editorText,
    '--preview-muted': c.textMuted,
    '--preview-heading': c.heading,
    '--preview-accent': c.accent,
    '--preview-link': c.link,
    '--preview-quote': c.quoteBar,
    '--preview-code': c.inlineCodeBackground,
  } as CSSProperties;
}

/** Selectable card with a miniature window drawn in the theme's colours. */
export function UiThemeCard({
  theme,
  selected,
  badges,
  onSelect,
}: {
  readonly theme: UiTheme;
  readonly selected: boolean;
  readonly badges: readonly string[];
  readonly onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={selected ? 'theme-card is-selected' : 'theme-card'}
      aria-pressed={selected}
      aria-label={`${theme.name} (${theme.kind})${badges.length > 0 ? `, ${badges.join(', ')}` : ''}`}
      onClick={onSelect}
    >
      <span className="ui-preview" style={previewStyle(theme)} aria-hidden="true">
        <span className="ui-preview-bar">
          <span className="ui-preview-tab" />
          <span className="ui-preview-tab is-muted" />
          <span className="ui-preview-pill" />
        </span>
        <span className="ui-preview-body">
          <span className="ui-preview-side" />
          <span className="ui-preview-editor">
            <span className="ui-preview-heading" />
            <span className="ui-preview-line" />
            <span className="ui-preview-line is-short" />
            <span className="ui-preview-quote" />
            <span className="ui-preview-link" />
          </span>
        </span>
      </span>
      <ThemeCardCaption name={theme.name} badges={badges} />
    </button>
  );
}

/** Name and badges below a card preview. */
export function ThemeCardCaption({
  name,
  badges,
  children,
}: {
  readonly name: string;
  readonly badges: readonly string[];
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <span className="theme-card-caption">
      <span className="theme-card-name">{name}</span>
      {children}
      {badges.map((badge) => (
        <span key={badge} className="badge">
          {badge}
        </span>
      ))}
    </span>
  );
}
