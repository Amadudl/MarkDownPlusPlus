import { useRef, type KeyboardEvent, type JSX } from 'react';
import { CodeXml, Eye, type LucideIcon } from 'lucide-react';
import { CommandId } from '@shared/commands';
import type { EditorMode } from '@shared/types';
import { shortcutText } from '@renderer/commands';
import { cycleItem } from './common/cycle';
import { setActiveMode } from '@renderer/commands/viewActions';
import { useActiveDocument } from '@renderer/hooks/useActiveDocument';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';

interface ModeOption {
  readonly mode: EditorMode;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const OPTIONS: readonly ModeOption[] = [
  {
    mode: 'wysiwyg',
    label: 'Visual',
    description: 'Formatted, what-you-see-is-what-you-get editing',
    icon: Eye,
  },
  {
    mode: 'source',
    label: 'Markdown',
    description: 'Raw Markdown source with syntax highlighting',
    icon: CodeXml,
  },
];

/**
 * The prominent segmented switch between the visual (WYSIWYG) editor and the
 * Markdown source editor. Implements the ARIA radio group pattern.
 */
export function ModeSwitch(): JSX.Element {
  const doc = useActiveDocument();
  const fallbackMode = useSettings((state) => state.settings.editor.defaultMode);
  const platform = useUi((state) => state.platform);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const mode = doc?.mode ?? fallbackMode;
  const disabled = doc === undefined;

  const move = (option: ModeOption, step: 1 | -1): void => {
    const next = cycleItem(OPTIONS, option, step);
    setActiveMode(next.mode);
    buttons.current[OPTIONS.indexOf(next)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: ModeOption): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(option, 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(option, -1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Editor mode"
      aria-description="Switch between Visual and Markdown"
      aria-disabled={disabled}
      className="mode-switch"
      data-mode={mode}
      data-tooltip="Switch between Visual and Markdown"
      data-shortcut={shortcutText(CommandId.ViewToggleMode, platform)}
      data-tooltip-placement="bottom"
    >
      <span className="mode-switch-thumb" aria-hidden="true" />
      {OPTIONS.map((option, index) => {
        const checked = option.mode === mode;
        const Icon = option.icon;
        return (
          <button
            key={option.mode}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-description={option.description}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            className={checked ? 'mode-switch-option is-checked' : 'mode-switch-option'}
            onClick={() => setActiveMode(option.mode)}
            onKeyDown={(event) => onKeyDown(event, option)}
          >
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
