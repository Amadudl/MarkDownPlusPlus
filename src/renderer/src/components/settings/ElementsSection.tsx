import { useRef, type JSX } from 'react';
import { Copy, Download, Trash2 } from 'lucide-react';
import type { ElementStyle } from '@shared/theme-model';
import { listElementStyles, resolveTheme } from '@renderer/themes';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { ConfirmButton } from './ConfirmButton';
import { ElementCardPreview } from './ElementCardPreview';
import { SettingRow, TextField } from './controls';
import { ElementTuning } from './ElementTuning';
import { ImportThemeButton } from './ImportThemeButton';
import { ElementSampleDocument } from './samples';
import { ThemeCardCaption } from './ThemeCard';
import {
  deleteCustomElementStyle,
  downloadTheme,
  duplicateElementStyle,
  editElementStyle,
  isBuiltinElementStyle,
  saveCustomElementStyle,
  selectElementStyle,
} from './themeActions';

/** Short human summary of the variants of a style, e.g. "Card quotes · Window code". */
export function describeElementStyle(style: ElementStyle): string {
  return [
    `${style.blockquote.variant.replace('-', ' ')} quotes`,
    `${style.codeBlock.variant} code`,
    `${style.table.variant} tables`,
    `${style.list.bullet} bullets`,
  ].join(' · ');
}

/** Space kept above an element revealed in the preview, in pixels. */
const PREVIEW_MARGIN = 12;

/**
 * Scrolls the live preview so the element edited by the focused control is visible. The
 * control's group names that element in `data-preview-target`. Only the preview box
 * scrolls; the surrounding settings panel stays where it is.
 */
export function revealPreviewTarget(preview: HTMLElement | null, control: EventTarget): void {
  if (preview === null || !(control instanceof Element)) return;
  const selector = control.closest<HTMLElement>('[data-preview-target]')?.dataset.previewTarget;
  const target = selector === undefined ? null : preview.querySelector(selector);
  if (target === null) return;
  const offset = target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
  preview.scrollTop = Math.max(0, preview.scrollTop + offset - PREVIEW_MARGIN);
}

/**
 * Settings → Markdown Elements: presets, a live preview and per-element fine tuning. The
 * preview stays in view (sticky) while the tuning controls scroll beneath it.
 */
export function ElementsSection(): JSX.Element {
  const previewRef = useRef<HTMLDivElement>(null);
  const settings = useSettings((state) => state.settings);
  const prefersDark = useUi((state) => state.prefersDark);
  const styles = listElementStyles(settings);
  const resolved = resolveTheme(settings, prefersDark);
  const active = resolved.elements;
  const builtin = isBuiltinElementStyle(active.id);

  return (
    <div className="settings-section">
      <section className="settings-block" aria-label="Presets">
        <div className="theme-grid theme-grid-wide">
          {styles.map((style) => {
            const selected = style.id === active.id;
            return (
              <button
                key={style.id}
                type="button"
                className={selected ? 'theme-card element-card is-selected' : 'theme-card element-card'}
                aria-pressed={selected}
                aria-label={style.name}
                onClick={() => void selectElementStyle(style.id)}
              >
                <ElementCardPreview style={style} theme={resolved} />
                <ThemeCardCaption
                  name={style.name}
                  badges={isBuiltinElementStyle(style.id) ? [] : ['Custom']}
                >
                  <span className="theme-card-description">
                    {style.description === '' ? describeElementStyle(style) : style.description}
                  </span>
                </ThemeCardCaption>
              </button>
            );
          })}
        </div>
      </section>

      <div className="element-workbench">
        <section className="settings-block element-preview-block" aria-label="Live preview">
          <h4 className="settings-block-title">Live preview — {active.name}</h4>
          <div className="element-preview" ref={previewRef}>
            <ElementSampleDocument />
          </div>
        </section>

        <section
          className="settings-block"
          aria-label="Fine tuning"
          onFocus={(event) => revealPreviewTarget(previewRef.current, event.target)}
        >
          <h4 className="settings-block-title">Fine tuning</h4>
          {builtin && (
            <p className="setting-description">
              Built-in presets stay unchanged: your first edit creates a custom copy.
            </p>
          )}
          <div className="settings-inline-actions">
            <button type="button" className="button" onClick={() => void duplicateElementStyle(active)}>
              <Copy size={14} aria-hidden="true" /> Duplicate
            </button>
            <button type="button" className="button" onClick={() => downloadTheme(active)}>
              <Download size={14} aria-hidden="true" /> Export JSON
            </button>
            <ImportThemeButton />
            {!builtin && (
              <ConfirmButton
                confirmLabel={`Delete “${active.name}”`}
                onConfirm={() => void deleteCustomElementStyle(active.id)}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete
              </ConfirmButton>
            )}
          </div>
          {!builtin && (
            <SettingRow label="Name" htmlFor="element-style-name">
              <TextField
                id="element-style-name"
                label="Style name"
                maxLength={64}
                value={active.name}
                onCommit={(name) => void saveCustomElementStyle({ ...active, name })}
              />
            </SettingRow>
          )}
          <ElementTuning style={active} onChange={(edit) => void editElementStyle(edit)} />
        </section>
      </div>
    </div>
  );
}
