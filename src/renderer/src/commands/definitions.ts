import { CommandId, type CommandIdValue } from '@shared/commands';
import type { FormatCommand } from '@renderer/editor/types';
import { getApi } from '@renderer/platform/api';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import {
  closeAllDocuments,
  closeDocument,
  createNewDocument,
  exportActiveDocument,
  openPath,
  openWithDialog,
  revealActiveDocument,
  saveAllDocuments,
  saveDocument,
  saveDocumentAs,
} from './documentActions';
import type { CommandCategory, CommandDefinition } from './registry';
import {
  resetZoom,
  runFormat,
  runHistory,
  setActiveMode,
  toggleActiveMode,
  toggleOutline,
  zoomBy,
  ZOOM_STEP,
} from './viewActions';

/** Project documentation opened by Help → Documentation. */
export const DOCUMENTATION_URL = 'https://github.com/Amadudl/MarkDownPlusPlus#readme';

type Spec = Omit<CommandDefinition, 'id' | 'inPalette'> & { readonly inPalette?: boolean };

function withActive(action: (id: string) => Promise<unknown>): () => Promise<void> {
  return async () => {
    const { activeId } = useDocuments.getState();
    if (activeId !== null) await action(activeId);
  };
}

function format(label: string, command: FormatCommand): Spec {
  return { label, category: 'Format', run: () => void runFormat(command) };
}

function file(label: string, run: Spec['run'], inPalette = true): Spec {
  return { label, category: 'File', run, inPalette };
}

function simple(category: CommandCategory, label: string, run: Spec['run']): Spec {
  return { label, category, run };
}

const SPECS: Readonly<Record<CommandIdValue, Spec>> = {
  [CommandId.FileNew]: file('New Document', () => void createNewDocument()),
  [CommandId.FileOpen]: file('Open…', openWithDialog),
  [CommandId.FileSave]: file('Save', withActive(saveDocument)),
  [CommandId.FileSaveAs]: file('Save As…', withActive(saveDocumentAs)),
  [CommandId.FileSaveAll]: file('Save All', async () => {
    await saveAllDocuments();
  }),
  [CommandId.FileClose]: file('Close Tab', withActive(closeDocument)),
  [CommandId.FileCloseAll]: file('Close All Tabs', async () => {
    await closeAllDocuments();
  }),
  [CommandId.FileExportHtml]: file('Export as HTML…', () => exportActiveDocument('html')),
  [CommandId.FileExportPdf]: file('Export as PDF…', () => exportActiveDocument('pdf')),
  [CommandId.FileExportImage]: file('Export as Image (PNG)…', () => exportActiveDocument('png')),
  [CommandId.FileRevealInFolder]: file('Reveal in File Manager', revealActiveDocument),
  [CommandId.FileOpenRecent]: file(
    'Open Recent File',
    async (path) => {
      if (path !== undefined && path !== '') await openPath(path);
    },
    false,
  ),
  [CommandId.FileClearRecent]: file('Clear Recent Files', () => getApi().recent.clear()),
  [CommandId.EditUndo]: simple('Edit', 'Undo', () => void runHistory('undo')),
  [CommandId.EditRedo]: simple('Edit', 'Redo', () => void runHistory('redo')),
  [CommandId.EditFind]: simple('Edit', 'Find', () => useUi.getState().openFind(false)),
  [CommandId.EditReplace]: simple('Edit', 'Find and Replace', () => useUi.getState().openFind(true)),
  [CommandId.ViewToggleMode]: simple('View', 'Toggle Visual / Markdown Mode', toggleActiveMode),
  [CommandId.ViewWysiwyg]: simple('View', 'Switch to Visual Mode', () => setActiveMode('wysiwyg')),
  [CommandId.ViewSource]: simple('View', 'Switch to Markdown Mode', () => setActiveMode('source')),
  [CommandId.ViewCommandPalette]: simple('View', 'Command Palette', () =>
    useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen),
  ),
  [CommandId.ViewZoomIn]: simple('View', 'Zoom In', () => zoomBy(ZOOM_STEP)),
  [CommandId.ViewZoomOut]: simple('View', 'Zoom Out', () => zoomBy(-ZOOM_STEP)),
  [CommandId.ViewZoomReset]: simple('View', 'Reset Zoom', resetZoom),
  [CommandId.ViewToggleFocusMode]: simple('View', 'Toggle Focus Mode', () =>
    useUi.getState().toggleFocusMode(),
  ),
  [CommandId.ViewToggleOutline]: simple('View', 'Toggle Outline', toggleOutline),
  [CommandId.ViewNextTab]: simple('View', 'Next Tab', () => useDocuments.getState().nextTab()),
  [CommandId.ViewPreviousTab]: simple('View', 'Previous Tab', () => useDocuments.getState().previousTab()),
  [CommandId.FormatBold]: format('Bold', 'bold'),
  [CommandId.FormatItalic]: format('Italic', 'italic'),
  [CommandId.FormatStrikethrough]: format('Strikethrough', 'strikethrough'),
  [CommandId.FormatInlineCode]: format('Inline Code', 'inlineCode'),
  [CommandId.FormatLink]: format('Link', 'link'),
  [CommandId.FormatHeading1]: format('Heading 1', 'heading1'),
  [CommandId.FormatHeading2]: format('Heading 2', 'heading2'),
  [CommandId.FormatHeading3]: format('Heading 3', 'heading3'),
  [CommandId.FormatParagraph]: format('Paragraph', 'paragraph'),
  [CommandId.FormatBulletList]: format('Bulleted List', 'bulletList'),
  [CommandId.FormatOrderedList]: format('Numbered List', 'orderedList'),
  [CommandId.FormatTaskList]: format('Task List', 'taskList'),
  [CommandId.FormatBlockquote]: format('Quote', 'blockquote'),
  [CommandId.FormatCodeBlock]: format('Code Block', 'codeBlock'),
  [CommandId.FormatTable]: format('Table', 'table'),
  [CommandId.FormatHorizontalRule]: format('Horizontal Rule', 'horizontalRule'),
  [CommandId.SettingsOpen]: simple('Settings', 'Open Settings', () =>
    useUi.getState().openDialog('settings'),
  ),
  [CommandId.HelpShortcuts]: simple('Help', 'Keyboard Shortcuts', () =>
    useUi.getState().openDialog('shortcuts'),
  ),
  [CommandId.HelpAbout]: simple('Help', 'About MarkDown++', () => useUi.getState().openDialog('about')),
  [CommandId.HelpDocumentation]: simple('Help', 'Documentation', () =>
    getApi().app.openExternal(DOCUMENTATION_URL),
  ),
};

/** Builds the definition of every command id declared in `@shared/commands`. */
export function createCommandDefinitions(): CommandDefinition[] {
  return (Object.entries(SPECS) as [CommandIdValue, Spec][]).map(([id, spec]) => ({
    id,
    label: spec.label,
    category: spec.category,
    inPalette: spec.inPalette ?? true,
    run: spec.run,
  }));
}
