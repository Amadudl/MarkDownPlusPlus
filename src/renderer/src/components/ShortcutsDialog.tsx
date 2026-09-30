import { useMemo, useState, type JSX } from 'react';
import { formatAccelerator } from '@shared/shortcuts';
import { listCommands, shortcutLabel, type CommandCategory } from '@renderer/commands';
import { fuzzyMatch } from '@renderer/commands/fuzzy';
import { useUi } from '@renderer/store/ui';
import { Kbd } from './common/Kbd';
import { Modal } from './common/Modal';

const CATEGORY_ORDER: readonly CommandCategory[] = ['File', 'Edit', 'View', 'Format', 'Settings', 'Help'];

/**
 * Extra hints for keys handled inside the editors themselves. Keys are Electron-style
 * accelerators, formatted for the current platform (e.g. `⇧Tab` on macOS).
 */
export const EDITOR_HINTS: readonly { readonly keys: readonly string[]; readonly label: string }[] = [
  { keys: ['/'], label: 'Open the slash menu (Visual mode, empty line)' },
  { keys: ['Tab', 'Shift+Tab'], label: 'Indent / outdent list items' },
  { keys: ['Enter', 'Shift+Enter'], label: 'Next / previous match in the find bar' },
  { keys: ['Esc'], label: 'Close the find bar, palette or dialog' },
];

/** The keys of an editor hint as shown on `platform`, alternatives separated by a slash. */
export function formatHintKeys(keys: readonly string[], platform: string): string {
  return keys.map((key) => formatAccelerator(key, platform)).join(' / ');
}

/** Searchable sheet of every keyboard shortcut. */
export function ShortcutsDialog(): JSX.Element {
  const platform = useUi((state) => state.platform);
  const [filter, setFilter] = useState('');
  const close = (): void => useUi.getState().closeDialog();

  const groups = useMemo(() => {
    const rows = listCommands().flatMap((command) => {
      const keys = shortcutLabel(command.id, platform);
      if (keys === null) return [];
      if (filter.trim() !== '' && fuzzyMatch(filter, `${command.category} ${command.label}`) === null)
        return [];
      return [{ id: command.id, label: command.label, category: command.category, keys }];
    });
    return CATEGORY_ORDER.map((category) => ({
      category,
      rows: rows.filter((row) => row.category === category),
    })).filter((group) => group.rows.length > 0);
  }, [filter, platform]);

  return (
    <Modal title="Keyboard shortcuts" onClose={close} className="shortcuts-dialog">
      <input
        type="search"
        className="text-input shortcuts-filter"
        placeholder="Filter shortcuts…"
        aria-label="Filter shortcuts"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="shortcuts-groups">
        <div className="shortcuts-columns">
          {groups.map((group) => (
            <section key={group.category} className="shortcuts-group" aria-label={group.category}>
              <h3>{group.category}</h3>
              <dl>
                {group.rows.map((row) => (
                  <div key={row.id} className="shortcuts-row">
                    <dt>{row.label}</dt>
                    <dd>
                      <Kbd>{row.keys}</Kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {groups.length === 0 && <p className="muted">No shortcuts match “{filter}”.</p>}
          {filter.trim() === '' && (
            <section className="shortcuts-group" aria-label="In the editor">
              <h3>In the editor</h3>
              <dl>
                {EDITOR_HINTS.map((hint) => (
                  <div key={hint.label} className="shortcuts-row">
                    <dt>{hint.label}</dt>
                    <dd>
                      <Kbd>{formatHintKeys(hint.keys, platform)}</Kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="button button-primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}
