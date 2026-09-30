import { useDeferredValue, useMemo, useState, type JSX } from 'react';
import { ListTree, X } from 'lucide-react';
import { extractHeadings } from '@renderer/editor/markdown-utils';
import { toggleOutline } from '@renderer/commands/viewActions';
import { useActiveDocument } from '@renderer/hooks/useActiveDocument';
import { getActiveAdapter } from '@renderer/store/adapters';
import { IconButton } from './common/IconButton';

/** Sidebar listing the headings of the active document; click one to scroll to it. */
export function Outline(): JSX.Element {
  const doc = useActiveDocument();
  const content = useDeferredValue(doc?.content ?? '');
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [selected, setSelected] = useState<number | null>(null);
  const minLevel = headings.reduce((min, heading) => Math.min(min, heading.level), 6);

  return (
    <aside className="outline" aria-label="Outline">
      <div className="outline-header">
        <ListTree size={14} strokeWidth={1.75} aria-hidden="true" />
        <span className="outline-title">Outline</span>
        <IconButton label="Hide outline" icon={X} iconSize={14} onClick={() => void toggleOutline()} />
      </div>
      {headings.length === 0 ? (
        <p className="outline-empty">No headings yet. Start a line with # to add one.</p>
      ) : (
        <nav aria-label="Document headings">
          <ol className="outline-list">
            {headings.map((heading, index) => (
              <li
                key={`${heading.line}-${index}`}
                style={{ paddingInlineStart: `${(heading.level - minLevel) * 12}px` }}
              >
                <button
                  type="button"
                  className={index === selected ? 'outline-item is-selected' : 'outline-item'}
                  data-level={heading.level}
                  aria-current={index === selected ? 'location' : undefined}
                  onClick={() => {
                    setSelected(index);
                    getActiveAdapter()?.scrollToHeading(index);
                  }}
                >
                  {heading.text === '' ? 'Untitled heading' : heading.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </aside>
  );
}
