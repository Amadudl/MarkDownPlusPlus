import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type JSX,
} from 'react';
import { Clock, CornerDownLeft, Search } from 'lucide-react';
import { CommandId } from '@shared/commands';
import type { RecentFile } from '@shared/types';
import { executeCommand, listCommands, shortcutLabel } from '@renderer/commands';
import { fuzzyFilter } from '@renderer/commands/fuzzy';
import { getApi } from '@renderer/platform/api';
import { basename, dirname } from '@renderer/platform/paths';
import { toastError, useUi } from '@renderer/store/ui';
import { Kbd } from './common/Kbd';
import { Modal } from './common/Modal';

/** One row of the palette. */
export interface PaletteItem {
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly detail: string | null;
  readonly shortcut: string | null;
  readonly run: () => void;
}

const MAX_RECENT_WITHOUT_QUERY = 5;

/** Splits a label into plain and highlighted runs (indices are UTF-16 offsets from `fuzzyMatch`). */
export function highlight(text: string, indices: readonly number[]): ReactNode {
  if (indices.length === 0) return text;
  const marks = new Set(indices);
  const runs: ReactNode[] = [];
  let start = 0;
  while (start < text.length) {
    const marked = marks.has(start);
    let end = start + 1;
    while (end < text.length && marks.has(end) === marked) end += 1;
    const chunk = text.slice(start, end);
    runs.push(
      marked ? (
        <mark key={start} className="palette-match">
          {chunk}
        </mark>
      ) : (
        chunk
      ),
    );
    start = end;
  }
  return runs;
}

function PaletteContent(): JSX.Element {
  const platform = useUi((state) => state.platform);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<readonly RecentFile[]>([]);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    getApi()
      .recent.get()
      .then((files) => {
        if (!cancelled) setRecent(files);
      })
      .catch((error: unknown) => toastError('Could not load recent files.', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const close = (): void => useUi.getState().setPaletteOpen(false);

  const items = useMemo<PaletteItem[]>(() => {
    const commands = listCommands()
      .filter((command) => command.inPalette)
      .map<PaletteItem>((command) => ({
        key: command.id,
        label: command.label,
        category: command.category,
        detail: null,
        shortcut: shortcutLabel(command.id, platform),
        run: () => void executeCommand(command.id),
      }));
    const files = recent.map<PaletteItem>((file) => ({
      key: `recent:${file.path}`,
      label: basename(file.path),
      category: 'Recent',
      detail: dirname(file.path),
      shortcut: null,
      run: () => void executeCommand(CommandId.FileOpenRecent, file.path),
    }));
    return [...files, ...commands];
  }, [platform, recent]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    const matches = fuzzyFilter(items, trimmed, (item) => item.label);
    if (trimmed !== '') return matches;
    let recentCount = 0;
    return matches.filter(
      ({ item }) => item.category !== 'Recent' || ++recentCount <= MAX_RECENT_WITHOUT_QUERY,
    );
  }, [items, query]);

  const current = Math.min(activeIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, results]);

  const runItem = (item: PaletteItem): void => {
    close();
    setTimeout(item.run, 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const count = results.length;
    switch (event.key) {
      case 'ArrowDown':
        if (count > 0) setActiveIndex((current + 1) % count);
        break;
      case 'ArrowUp':
        if (count > 0) setActiveIndex((current - 1 + count) % count);
        break;
      case 'Home':
        setActiveIndex(0);
        break;
      case 'End':
        setActiveIndex(Math.max(count - 1, 0));
        break;
      case 'Enter': {
        const selected = results[current];
        if (selected !== undefined) runItem(selected.item);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const optionId = (index: number): string => `${listId}-option-${index}`;

  return (
    <Modal title="Command palette" hideTitle onClose={close} className="palette">
      <div className="palette-search">
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <input
          className="palette-input"
          type="text"
          role="combobox"
          aria-label="Search commands and recent files"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? optionId(current) : undefined}
          placeholder="Type a command or file name…"
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-label="Commands" className="palette-list">
        {results.map(({ item, match }, index) => (
          <li
            key={item.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === current}
            className={index === current ? 'palette-option is-active' : 'palette-option'}
            onMouseMove={() => {
              if (index !== current) setActiveIndex(index);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runItem(item)}
          >
            {item.category === 'Recent' ? (
              <Clock className="palette-option-icon" size={14} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <span className="palette-category">{item.category}</span>
            )}
            <span className="palette-label">{highlight(item.label, match.indices)}</span>
            {item.detail !== null && <span className="palette-detail">{item.detail}</span>}
            {item.shortcut !== null && <Kbd>{item.shortcut}</Kbd>}
          </li>
        ))}
        {results.length === 0 && (
          <li className="palette-empty" role="presentation">
            No matching commands
          </li>
        )}
      </ul>
      <div className="palette-footer" aria-hidden="true">
        <span>
          <Kbd>↑↓</Kbd> navigate
        </span>
        <span>
          <CornerDownLeft size={12} strokeWidth={2} /> run
        </span>
        <span>
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </Modal>
  );
}

/** Searchable list of every command and the recent files (Ctrl/⌘+Shift+P). */
export function CommandPalette(): JSX.Element | null {
  const open = useUi((state) => state.paletteOpen);
  return open ? <PaletteContent /> : null;
}
