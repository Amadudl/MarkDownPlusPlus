import type { KeyboardEvent, JSX } from 'react';
import { Blocks, Code, Info, Palette, SlidersHorizontal, SquarePen, type LucideIcon } from 'lucide-react';
import { AboutContent } from '@renderer/components/AboutContent';
import { Modal } from '@renderer/components/common/Modal';
import { useSettings } from '@renderer/store/settings';
import { useUi, type SettingsSection } from '@renderer/store/ui';
import { AppearanceSection } from './AppearanceSection';
import { CodeBlocksSection } from './CodeBlocksSection';
import { cycleItem } from '@renderer/components/common/cycle';
import { ConfirmButton } from './ConfirmButton';
import { EditorSection } from './EditorSection';
import { ElementsSection } from './ElementsSection';
import { GeneralSection } from './GeneralSection';

interface SectionInfo {
  readonly id: SettingsSection;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly render: () => JSX.Element;
}

const SECTION_INFO: Readonly<Record<SettingsSection, SectionInfo>> = {
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    description: 'Colour schemes, system appearance and zoom.',
    icon: Palette,
    render: () => <AppearanceSection />,
  },
  code: {
    id: 'code',
    label: 'Code Blocks',
    description: 'Syntax themes for code blocks and the Markdown source.',
    icon: Code,
    render: () => <CodeBlocksSection />,
  },
  elements: {
    id: 'elements',
    label: 'Markdown Elements',
    description: 'How headings, quotes, tables, lists and more are rendered.',
    icon: Blocks,
    render: () => <ElementsSection />,
  },
  editor: {
    id: 'editor',
    label: 'Editor',
    description: 'Editing behaviour, fonts and auto save.',
    icon: SquarePen,
    render: () => <EditorSection />,
  },
  general: {
    id: 'general',
    label: 'General',
    description: 'Startup, confirmations and privacy.',
    icon: SlidersHorizontal,
    render: () => <GeneralSection />,
  },
  about: {
    id: 'about',
    label: 'About',
    description: 'Version and license information.',
    icon: Info,
    render: () => <AboutContent />,
  },
};

/** Sidebar entries of the settings dialog, in display order. */
export const SETTINGS_SECTIONS: readonly SectionInfo[] = Object.values(SECTION_INFO);

/** Modal settings window with a section sidebar. Every change applies live. */
export function SettingsDialog(): JSX.Element {
  const sectionId = useUi((state) => state.settingsSection);
  const section = SECTION_INFO[sectionId];
  const close = (): void => useUi.getState().closeDialog();

  const onNavKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const ids = SETTINGS_SECTIONS.map((item) => item.id);
    const next = cycleItem(ids, sectionId, event.key === 'ArrowDown' ? 1 : -1);
    useUi.getState().setSettingsSection(next);
    event.currentTarget.querySelector<HTMLElement>(`#settings-tab-${next}`)?.focus();
  };

  return (
    <Modal
      title="Settings"
      hideTitle
      onClose={close}
      className="settings-dialog"
      initialFocus=".settings-nav [aria-selected='true']"
    >
      <div className="settings-layout">
        <div className="settings-sidebar">
          <p className="settings-sidebar-title" aria-hidden="true">
            Settings
          </p>
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="Settings sections"
            className="settings-nav"
            onKeyDown={onNavKeyDown}
          >
            {SETTINGS_SECTIONS.map((item) => {
              const Icon = item.icon;
              const selected = item.id === section.id;
              return (
                <button
                  key={item.id}
                  id={`settings-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="settings-panel"
                  tabIndex={selected ? 0 : -1}
                  className={selected ? 'settings-nav-item is-selected' : 'settings-nav-item'}
                  onClick={() => useUi.getState().setSettingsSection(item.id)}
                >
                  <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="settings-sidebar-footer">
            <ConfirmButton
              className="button button-ghost"
              confirmLabel="Reset"
              onConfirm={() => {
                void useSettings
                  .getState()
                  .reset()
                  .then((ok) => {
                    if (ok) useUi.getState().pushToast('success', 'Settings were reset to their defaults.');
                  });
              }}
            >
              Reset to defaults
            </ConfirmButton>
          </div>
        </div>
        <div
          // A fresh scroll container per section, so every section opens at its top.
          key={section.id}
          className="settings-content"
          role="tabpanel"
          id="settings-panel"
          aria-labelledby={`settings-tab-${section.id}`}
        >
          <header className="settings-content-header">
            <h3>{section.label}</h3>
            <p>{section.description}</p>
          </header>
          {section.render()}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="button button-primary" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}
