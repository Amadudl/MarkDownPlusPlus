import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandId, type CommandIdValue } from '@shared/commands';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { createFakeAdapter, type FakeAdapter } from '@renderer/test/fakeEditor';
import { resetApp } from '@renderer/test/utils';
import { setAdapter } from '@renderer/store/adapters';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import {
  bindMenuCommands,
  createCommandDefinitions,
  DOCUMENTATION_URL,
  executeCommand,
  listCommands,
  registerDefaultCommands,
} from './index';

vi.mock('@renderer/export', () => ({ buildStandaloneHtml: vi.fn(() => Promise.resolve('<html></html>')) }));

const docs = useDocuments.getState;

describe('command definitions', () => {
  let api: FakeApi;
  let adapter: FakeAdapter;

  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A')]);
    registerDefaultCommands();
  });

  const withDocument = async (): Promise<string> => {
    await executeCommand(CommandId.FileOpenRecent, '/a.md');
    const id = docs().activeId!;
    adapter = createFakeAdapter('wysiwyg', 'A');
    setAdapter(id, adapter);
    return id;
  };

  it('defines every command id exactly once with a label and category', () => {
    const definitions = createCommandDefinitions();
    const ids = new Set(Object.values(CommandId));
    expect(new Set(definitions.map((definition) => definition.id))).toEqual(ids);
    expect(definitions.every((definition) => definition.label.length > 0)).toBe(true);
    expect(listCommands()).toHaveLength(ids.size);
    expect(definitions.find((definition) => definition.id === CommandId.FileOpenRecent)?.inPalette).toBe(
      false,
    );
  });

  it('runs file commands', async () => {
    await executeCommand(CommandId.FileNew);
    expect(selectActiveDocument(docs())?.title).toBe('Untitled-1');
    api.state.openDialogResult = [fakeFile('/b.md')];
    await executeCommand(CommandId.FileOpen);
    expect(selectActiveDocument(docs())?.path).toBe('/b.md');
    const id = await withDocument();
    docs().updateContent(id, 'changed');
    await executeCommand(CommandId.FileSave);
    expect(api.file.save).toHaveBeenCalledTimes(1);
    api.state.saveAsPath = '/c.md';
    await executeCommand(CommandId.FileSaveAs);
    expect(selectActiveDocument(docs())?.path).toBe('/c.md');
    await executeCommand(CommandId.FileSaveAll);
    await executeCommand(CommandId.FileExportHtml);
    await executeCommand(CommandId.FileExportPdf);
    await executeCommand(CommandId.FileExportImage);
    expect(api.file.exportHtml).toHaveBeenCalled();
    expect(api.file.exportPdf).toHaveBeenCalled();
    expect(api.file.exportImage).toHaveBeenCalled();
    await executeCommand(CommandId.FileRevealInFolder);
    expect(api.file.revealInFolder).toHaveBeenCalledWith('/c.md');
    await executeCommand(CommandId.FileClose);
    expect(docs().documents.some((doc) => doc.id === id)).toBe(false);
    await executeCommand(CommandId.FileCloseAll);
    expect(docs().documents).toEqual([]);
    await executeCommand(CommandId.FileSave);
    await executeCommand(CommandId.FileClearRecent);
    expect(api.recent.clear).toHaveBeenCalled();
  });

  it('ignores open recent without a path', async () => {
    await executeCommand(CommandId.FileOpenRecent);
    await executeCommand(CommandId.FileOpenRecent, '');
    expect(api.file.read).not.toHaveBeenCalled();
  });

  it('runs edit commands', async () => {
    await withDocument();
    await executeCommand(CommandId.EditUndo);
    await executeCommand(CommandId.EditRedo);
    expect([adapter.undoCount, adapter.redoCount]).toEqual([1, 1]);
    await executeCommand(CommandId.EditFind);
    expect(useUi.getState().findBar).toMatchObject({ open: true, replace: false });
    await executeCommand(CommandId.EditReplace);
    expect(useUi.getState().findBar).toMatchObject({ open: true, replace: true });
  });

  it('runs view commands', async () => {
    await withDocument();
    await executeCommand(CommandId.ViewToggleMode);
    expect(selectActiveDocument(docs())?.mode).toBe('source');
    await executeCommand(CommandId.ViewWysiwyg);
    expect(selectActiveDocument(docs())?.mode).toBe('wysiwyg');
    await executeCommand(CommandId.ViewSource);
    expect(selectActiveDocument(docs())?.mode).toBe('source');
    await executeCommand(CommandId.ViewCommandPalette);
    expect(useUi.getState().paletteOpen).toBe(true);
    await executeCommand(CommandId.ViewCommandPalette);
    expect(useUi.getState().paletteOpen).toBe(false);
    await executeCommand(CommandId.ViewZoomIn);
    expect(useSettings.getState().settings.appearance.zoom).toBe(1.1);
    await executeCommand(CommandId.ViewZoomOut);
    await executeCommand(CommandId.ViewZoomOut);
    expect(useSettings.getState().settings.appearance.zoom).toBe(0.9);
    await executeCommand(CommandId.ViewZoomReset);
    expect(useSettings.getState().settings.appearance.zoom).toBe(1);
    await executeCommand(CommandId.ViewToggleFocusMode);
    expect(useUi.getState().focusMode).toBe(true);
    await executeCommand(CommandId.ViewToggleOutline);
    expect(useUi.getState().outlineVisible).toBe(true);
    await executeCommand(CommandId.FileNew);
    const second = docs().activeId;
    await executeCommand(CommandId.ViewNextTab);
    expect(docs().activeId).not.toBe(second);
    await executeCommand(CommandId.ViewPreviousTab);
    expect(docs().activeId).toBe(second);
  });

  it('maps every format command to the editor', async () => {
    await withDocument();
    const formats: [CommandIdValue, string][] = [
      [CommandId.FormatBold, 'bold'],
      [CommandId.FormatItalic, 'italic'],
      [CommandId.FormatStrikethrough, 'strikethrough'],
      [CommandId.FormatInlineCode, 'inlineCode'],
      [CommandId.FormatLink, 'link'],
      [CommandId.FormatHeading1, 'heading1'],
      [CommandId.FormatHeading2, 'heading2'],
      [CommandId.FormatHeading3, 'heading3'],
      [CommandId.FormatParagraph, 'paragraph'],
      [CommandId.FormatBulletList, 'bulletList'],
      [CommandId.FormatOrderedList, 'orderedList'],
      [CommandId.FormatTaskList, 'taskList'],
      [CommandId.FormatBlockquote, 'blockquote'],
      [CommandId.FormatCodeBlock, 'codeBlock'],
      [CommandId.FormatTable, 'table'],
      [CommandId.FormatHorizontalRule, 'horizontalRule'],
    ];
    for (const [id] of formats) await executeCommand(id);
    expect(adapter.commands).toEqual(formats.map(([, command]) => command));
  });

  it('opens dialogs and the documentation', async () => {
    await executeCommand(CommandId.SettingsOpen);
    expect(useUi.getState().dialog).toBe('settings');
    await executeCommand(CommandId.HelpShortcuts);
    expect(useUi.getState().dialog).toBe('shortcuts');
    await executeCommand(CommandId.HelpAbout);
    expect(useUi.getState().dialog).toBe('about');
    await executeCommand(CommandId.HelpDocumentation);
    expect(api.app.openExternal).toHaveBeenCalledWith(DOCUMENTATION_URL);
  });

  it('executes commands sent by the native menu', async () => {
    const stop = bindMenuCommands();
    api.emit.menuCommand(CommandId.HelpAbout);
    api.emit.menuCommand('not.a.command' as CommandIdValue);
    await vi.waitFor(() => expect(useUi.getState().dialog).toBe('about'));
    stop();
    expect(api.listenerCounts().menu).toBe(0);
  });
});
