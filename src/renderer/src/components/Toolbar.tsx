import type { KeyboardEvent, JSX } from 'react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Redo2,
  Search,
  SquareCode,
  Strikethrough,
  Table2,
  TextQuote,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { CommandId, type CommandIdValue } from '@shared/commands';
import { executeCommand, shortcutLabel } from '@renderer/commands';
import { useUi } from '@renderer/store/ui';
import { cycleItem } from './common/cycle';
import { IconButton } from './common/IconButton';

interface ToolbarItem {
  readonly id: CommandIdValue;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Toolbar layout: groups are separated visually. */
export const TOOLBAR_GROUPS: readonly (readonly ToolbarItem[])[] = [
  [
    { id: CommandId.FormatBold, label: 'Bold', icon: Bold },
    { id: CommandId.FormatItalic, label: 'Italic', icon: Italic },
    { id: CommandId.FormatStrikethrough, label: 'Strikethrough', icon: Strikethrough },
    { id: CommandId.FormatInlineCode, label: 'Inline code', icon: Code },
    { id: CommandId.FormatLink, label: 'Link', icon: Link },
  ],
  [
    { id: CommandId.FormatHeading1, label: 'Heading 1', icon: Heading1 },
    { id: CommandId.FormatHeading2, label: 'Heading 2', icon: Heading2 },
    { id: CommandId.FormatHeading3, label: 'Heading 3', icon: Heading3 },
    { id: CommandId.FormatParagraph, label: 'Paragraph', icon: Pilcrow },
  ],
  [
    { id: CommandId.FormatBulletList, label: 'Bulleted list', icon: List },
    { id: CommandId.FormatOrderedList, label: 'Numbered list', icon: ListOrdered },
    { id: CommandId.FormatTaskList, label: 'Task list', icon: ListTodo },
  ],
  [
    { id: CommandId.FormatBlockquote, label: 'Quote', icon: TextQuote },
    { id: CommandId.FormatCodeBlock, label: 'Code block', icon: SquareCode },
    { id: CommandId.FormatTable, label: 'Table', icon: Table2 },
    { id: CommandId.FormatHorizontalRule, label: 'Horizontal rule', icon: Minus },
  ],
  [
    { id: CommandId.EditUndo, label: 'Undo', icon: Undo2 },
    { id: CommandId.EditRedo, label: 'Redo', icon: Redo2 },
  ],
  [{ id: CommandId.EditFind, label: 'Find', icon: Search }],
];

/**
 * Roving-focus keys. Home/End start from "no item", so +1 yields the first and
 * -1 the last button (see {@link cycleItem}).
 */
const NAVIGATION_KEYS: Readonly<
  Partial<Record<string, { readonly relative: boolean; readonly step: 1 | -1 }>>
> = {
  ArrowRight: { relative: true, step: 1 },
  ArrowLeft: { relative: true, step: -1 },
  Home: { relative: false, step: 1 },
  End: { relative: false, step: -1 },
};

/**
 * Formatting toolbar (ARIA toolbar pattern with arrow-key navigation). Buttons
 * keep the editor selection by not taking focus on mouse down.
 */
export function Toolbar(): JSX.Element {
  const platform = useUi((state) => state.platform);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const navigation = NAVIGATION_KEYS[event.key];
    if (navigation === undefined) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const focused = buttons.find((button) => button === document.activeElement) ?? null;
    cycleItem<HTMLButtonElement | null>(
      buttons,
      navigation.relative ? focused : null,
      navigation.step,
    )?.focus();
    event.preventDefault();
  };

  return (
    <div role="toolbar" aria-label="Formatting" className="toolbar" onKeyDown={onKeyDown}>
      {TOOLBAR_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="toolbar-group" role="group">
          {group.map((item, itemIndex) => (
            <IconButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              shortcut={shortcutLabel(item.id, platform)}
              tabIndex={groupIndex === 0 && itemIndex === 0 ? 0 : -1}
              tooltipPlacement={groupIndex === 0 ? 'start' : 'bottom'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void executeCommand(item.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
