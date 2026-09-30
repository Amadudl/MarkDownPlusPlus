import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type JSX,
  type WheelEvent,
} from 'react';
import { ChevronDown, FileText, Plus, X } from 'lucide-react';
import { CommandId } from '@shared/commands';
import { shortcutLabel } from '@renderer/commands';
import { closeDocument, createNewDocument } from '@renderer/commands/documentActions';
import { isDirty, useDocuments, type DocumentTab } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { cycleItem } from './common/cycle';
import { IconButton } from './common/IconButton';

const TAB_MIME = 'application/x-mpp-tab';

interface TabProps {
  readonly doc: DocumentTab;
  readonly active: boolean;
  readonly dropTarget: boolean;
  readonly register: (id: string, element: HTMLDivElement | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>, id: string) => void;
  readonly onDragStart: (id: string) => void;
  readonly onDragOverTab: (id: string) => void;
  readonly onDropOnTab: (event: DragEvent<HTMLDivElement>, id: string) => void;
  readonly onDragEnd: () => void;
}

function Tab({
  doc,
  active,
  dropTarget,
  register,
  onKeyDown,
  onDragStart,
  onDragOverTab,
  onDropOnTab,
  onDragEnd,
}: TabProps): JSX.Element {
  const dirty = isDirty(doc);
  const className = ['tab', active && 'is-active', dirty && 'is-dirty', dropTarget && 'is-drop-target']
    .filter(Boolean)
    .join(' ');
  return (
    <div
      ref={(element) => register(doc.id, element)}
      role="tab"
      id={`tab-${doc.id}`}
      aria-selected={active}
      aria-controls={`panel-${doc.id}`}
      tabIndex={active ? 0 : -1}
      title={doc.path ?? `${doc.title} (not saved yet)`}
      className={className}
      draggable
      onClick={() => useDocuments.getState().activate(doc.id)}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1) void closeDocument(doc.id);
      }}
      onKeyDown={(event) => onKeyDown(event, doc.id)}
      onDragStart={(event) => {
        event.dataTransfer.setData(TAB_MIME, doc.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(doc.id);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(TAB_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onDragOverTab(doc.id);
      }}
      onDrop={(event) => onDropOnTab(event, doc.id)}
      onDragEnd={onDragEnd}
    >
      <FileText className="tab-icon" size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="tab-title">{doc.title}</span>
      {dirty && <span className="visually-hidden">(unsaved changes)</span>}
      <button
        type="button"
        className="tab-close"
        tabIndex={-1}
        aria-label={`Close ${doc.title}`}
        onClick={(event) => {
          event.stopPropagation();
          void closeDocument(doc.id);
        }}
      >
        <span className="tab-dirty-dot" aria-hidden="true" />
        <X size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Which edges of the tab list hide tabs that are scrolled out of view. */
interface Overflow {
  readonly start: boolean;
  readonly end: boolean;
}

const NO_OVERFLOW: Overflow = { start: false, end: false };

/** Measures whether the scrollable list hides content before or after the visible part. */
export function measureOverflow(list: HTMLElement): Overflow {
  const max = list.scrollWidth - list.clientWidth;
  return { start: list.scrollLeft > 1, end: list.scrollLeft < max - 1 };
}

const MENU_KEYS: Readonly<Partial<Record<string, { readonly relative: boolean; readonly step: 1 | -1 }>>> = {
  ArrowDown: { relative: true, step: 1 },
  ArrowUp: { relative: true, step: -1 },
  Home: { relative: false, step: 1 },
  End: { relative: false, step: -1 },
};

/**
 * "All open documents" drop-down, shown while tabs overflow the strip so that hidden
 * tabs stay discoverable (ARIA menu button with radio items).
 */
function TabOverflowMenu({
  documents,
  activeId,
  onPick,
}: {
  readonly documents: readonly DocumentTab[];
  readonly activeId: string | null;
  readonly onPick: (id: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
    const onPointerDown = (event: MouseEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const closeMenu = (): void => {
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>('.tab-overflow-button')?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const navigation = MENU_KEYS[event.key];
    if (navigation === undefined) return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const focused = items.find((item) => item === document.activeElement) ?? null;
    cycleItem<HTMLElement | null>(items, navigation.relative ? focused : null, navigation.step)?.focus();
  };

  return (
    <div className="tab-overflow" ref={rootRef}>
      <IconButton
        className="tab-overflow-button"
        label="All open documents"
        icon={ChevronDown}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="All open documents"
          className="tab-overflow-menu"
          onKeyDown={onMenuKeyDown}
        >
          {documents.map((doc) => {
            const checked = doc.id === activeId;
            return (
              <button
                key={doc.id}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                title={doc.path ?? `${doc.title} (not saved yet)`}
                className={checked ? 'tab-overflow-item is-active' : 'tab-overflow-item'}
                onClick={() => {
                  setOpen(false);
                  onPick(doc.id);
                }}
              >
                <FileText size={14} strokeWidth={1.75} aria-hidden="true" />
                <span className="tab-overflow-title">{doc.title}</span>
                {isDirty(doc) && (
                  <span className="tab-overflow-dirty" aria-label="unsaved changes" role="img" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Scrollable strip of open documents: click to activate, middle-click or the
 * close button to close, drag to reorder, arrow keys to move between tabs and
 * double-click on the empty area for a new document. Tabs shrink before the strip
 * overflows; then edge fades, wheel scrolling and an "All open documents" menu keep
 * hidden tabs reachable, and the active tab is kept in view when the window resizes.
 */
export function TabStrip(): JSX.Element {
  const documents = useDocuments((state) => state.documents);
  const activeId = useDocuments((state) => state.activeId);
  const platform = useUi((state) => state.platform);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // A callback ref (state) so the effects below re-run once the list is mounted.
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState<Overflow>(NO_OVERFLOW);

  const updateOverflow = useCallback((element: HTMLElement): void => {
    const next = measureOverflow(element);
    setOverflow((previous) => (previous.start === next.start && previous.end === next.end ? previous : next));
  }, []);

  const revealActive = useCallback(
    (element: HTMLElement): void => {
      if (activeId !== null) {
        elements.current.get(activeId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      updateOverflow(element);
    },
    [activeId, updateOverflow],
  );

  // After layout (next frame): bring the active tab into view and re-measure the overflow.
  useEffect(() => {
    if (list === null) return;
    const frame = requestAnimationFrame(() => revealActive(list));
    return () => cancelAnimationFrame(frame);
  }, [documents, list, revealActive]);

  // A narrower window must never leave the active tab scrolled out of view.
  useEffect(() => {
    if (list === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => revealActive(list));
    observer.observe(list);
    return () => observer.disconnect();
  }, [list, revealActive]);

  // Mouse wheels only scroll vertically; map that to the horizontal tab list.
  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    const list = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft += event.deltaY;
  };

  const register = (id: string, element: HTMLDivElement | null): void => {
    if (element === null) elements.current.delete(id);
    else elements.current.set(id, element);
  };

  const focusTab = (id: string): void => {
    useDocuments.getState().activate(id);
    elements.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string): void => {
    const ids = documents.map((doc) => doc.id);
    switch (event.key) {
      case 'ArrowRight':
        focusTab(cycleItem(ids, id, 1));
        break;
      case 'ArrowLeft':
        focusTab(cycleItem(ids, id, -1));
        break;
      case 'Home':
        focusTab(cycleItem(ids, '', 1));
        break;
      case 'End':
        focusTab(cycleItem(ids, '', -1));
        break;
      case 'Delete':
        void closeDocument(id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const endDrag = (): void => {
    setDragId(null);
    setDropTargetId(null);
  };

  const onDropOnTab = (event: DragEvent<HTMLDivElement>, targetId: string): void => {
    const sourceId = event.dataTransfer.getData(TAB_MIME) || dragId;
    if (sourceId === null || sourceId === '') return;
    event.preventDefault();
    useDocuments.getState().reorder(sourceId, targetId);
    endDrag();
  };

  const newShortcut = shortcutLabel(CommandId.FileNew, platform);

  return (
    <div className="tabstrip">
      <div
        ref={setList}
        role="tablist"
        aria-label="Open documents"
        className="tabstrip-list"
        data-overflow-start={overflow.start}
        data-overflow-end={overflow.end}
        onScroll={(event) => updateOverflow(event.currentTarget)}
        onWheel={onWheel}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) createNewDocument();
        }}
      >
        {documents.map((doc) => (
          <Tab
            key={doc.id}
            doc={doc}
            active={doc.id === activeId}
            dropTarget={dropTargetId === doc.id && dragId !== doc.id}
            register={register}
            onKeyDown={onKeyDown}
            onDragStart={setDragId}
            onDragOverTab={setDropTargetId}
            onDropOnTab={onDropOnTab}
            onDragEnd={endDrag}
          />
        ))}
      </div>
      {(overflow.start || overflow.end) && (
        <TabOverflowMenu documents={documents} activeId={activeId} onPick={focusTab} />
      )}
      <IconButton
        className="tabstrip-new"
        label="New document"
        shortcut={newShortcut}
        icon={Plus}
        onClick={() => createNewDocument()}
      />
      <div className="tabstrip-filler" aria-hidden="true" onDoubleClick={() => createNewDocument()} />
    </div>
  );
}
