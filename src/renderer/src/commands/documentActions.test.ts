import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { createFakeAdapter } from '@renderer/test/fakeEditor';
import { resetApp, setSettings } from '@renderer/test/utils';
import { setAdapter } from '@renderer/store/adapters';
import { isDirty, selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import {
  closeAllDocuments,
  closeDocument,
  createNewDocument,
  defaultMode,
  exportActiveDocument,
  flushEditor,
  newDocumentLineEnding,
  openFiles,
  openPath,
  openTutorial,
  openWithDialog,
  reloadDocument,
  resolveUnsaved,
  revealActiveDocument,
  saveAllDocuments,
  saveDocument,
  saveDocumentAs,
  toggleLineEnding,
  TUTORIAL_TITLE,
} from './documentActions';

vi.mock('@renderer/export', () => ({
  buildStandaloneHtml: vi.fn((input: { title: string }) => Promise.resolve(`<html>${input.title}</html>`)),
}));

const docs = useDocuments.getState;
const lastToast = (): string | undefined => useUi.getState().toasts.at(-1)?.message;
const getDoc = (id: string) => docs().documents.find((doc) => doc.id === id);

describe('document actions', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/docs/a.md', 'A'), fakeFile('/docs/b.md', 'B')]);
  });

  it('derives mode and line ending of new documents from the settings', () => {
    expect(defaultMode()).toBe('wysiwyg');
    expect(newDocumentLineEnding()).toBe('lf');
    useUi.setState({ platform: 'win32' });
    expect(newDocumentLineEnding()).toBe('crlf');
    setSettings(api, { editor: { newLineEnding: 'lf', defaultMode: 'source' } });
    expect(newDocumentLineEnding()).toBe('lf');
    createNewDocument();
    expect(selectActiveDocument(docs())).toMatchObject({
      mode: 'source',
      lineEnding: 'lf',
      title: 'Untitled-1',
    });
  });

  it('opens the tutorial once', () => {
    const id = openTutorial();
    const doc = selectActiveDocument(docs())!;
    expect(doc.title).toBe(TUTORIAL_TITLE);
    expect(doc.content).toContain('# Welcome to MarkDown++');
    expect(isDirty(doc)).toBe(false);
    createNewDocument();
    expect(openTutorial()).toBe(id);
    expect(docs().activeId).toBe(id);
  });

  it('opens files, dialog results and paths', async () => {
    openFiles([fakeFile('/x.md')], 'source');
    expect(selectActiveDocument(docs())?.mode).toBe('source');
    api.state.openDialogResult = [fakeFile('/y.md')];
    await openWithDialog();
    expect(selectActiveDocument(docs())?.path).toBe('/y.md');
    await expect(openPath('/docs/a.md')).resolves.toBe(true);
    expect(selectActiveDocument(docs())?.content).toBe('A');
    await expect(openPath('/x.md')).resolves.toBe(true);
    expect(selectActiveDocument(docs())?.path).toBe('/x.md');
    expect(api.file.read).toHaveBeenCalledTimes(1);
  });

  it('reports open failures', async () => {
    vi.mocked(api.file.openDialog).mockRejectedValueOnce(new Error('denied'));
    await openWithDialog();
    expect(lastToast()).toBe('Could not open file.');
    await expect(openPath('/missing.md')).resolves.toBe(false);
    expect(lastToast()).toBe('Could not open /missing.md');
  });

  it('flushes the editor before saving to the existing path', async () => {
    await openPath('/docs/a.md');
    const id = docs().activeId!;
    const adapter = createFakeAdapter('wysiwyg', 'A');
    adapter.markdown = 'A edited';
    setAdapter(id, adapter);
    await expect(saveDocument(id)).resolves.toBe(true);
    expect(api.file.save).toHaveBeenCalledWith({
      path: '/docs/a.md',
      content: 'A edited',
      lineEnding: 'lf',
      hasBom: false,
    });
    expect(isDirty(selectActiveDocument(docs())!)).toBe(false);
    expect(flushEditor('missing')).toBeUndefined();
  });

  it('reports save failures and unknown ids', async () => {
    await openPath('/docs/a.md');
    vi.mocked(api.file.save).mockRejectedValueOnce(new Error('EACCES'));
    await expect(saveDocument(docs().activeId!)).resolves.toBe(false);
    expect(lastToast()).toBe('Could not save a.md');
    await expect(saveDocument('missing')).resolves.toBe(false);
    await expect(saveDocumentAs('missing')).resolves.toBe(false);
  });

  it('saves untitled documents through Save As', async () => {
    const id = createNewDocument();
    docs().updateContent(id, 'new');
    await expect(saveDocument(id)).resolves.toBe(false);
    expect(api.file.saveAs).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Untitled-1.md', documentPath: null, content: 'new' }),
    );
    api.state.saveAsPath = '/docs/new.md';
    await expect(saveDocument(id)).resolves.toBe(true);
    expect(selectActiveDocument(docs())).toMatchObject({ path: '/docs/new.md', title: 'new.md' });
  });

  it('Save As over another open document closes the duplicate tab', async () => {
    await openPath('/docs/b.md');
    await openPath('/docs/a.md');
    const a = docs().activeId!;
    api.state.saveAsPath = '/docs/b.md';
    await expect(saveDocumentAs(a)).resolves.toBe(true);
    expect(docs().documents.map((doc) => doc.path)).toEqual(['/docs/b.md']);
    // The dialog starts in the folder of the document being saved.
    expect(api.file.saveAs).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'a.md', documentPath: '/docs/a.md' }),
    );
    api.state.saveAsPath = '/docs/b.md';
    await expect(saveDocumentAs(a)).resolves.toBe(true);
    expect(docs().documents).toHaveLength(1);
  });

  describe('Save As over a tab with unsaved edits', () => {
    const setup = async (): Promise<{ a: string; b: string }> => {
      await openPath('/docs/b.md');
      const b = docs().activeId!;
      docs().updateContent(b, 'unsaved B');
      await openPath('/docs/a.md');
      const a = docs().activeId!;
      api.state.saveAsPath = '/docs/b.md';
      return { a, b };
    };

    it('closes the overwritten tab when the user discards its edits', async () => {
      const { a } = await setup();
      api.state.unsavedChoice = 'discard';
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(api.app.confirmUnsaved).toHaveBeenCalledWith('b.md');
      expect(docs().documents.map((doc) => doc.id)).toEqual([a]);
      expect(docs().activeId).toBe(a);
    });

    it('keeps the edits in an untitled tab when the user cancels', async () => {
      const { a, b } = await setup();
      api.state.unsavedChoice = 'cancel';
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(docs().documents).toHaveLength(2);
      expect(getDoc(b)).toMatchObject({ path: null, title: 'b.md', content: 'unsaved B' });
      expect(isDirty(getDoc(b)!)).toBe(true);
      expect(getDoc(a)?.path).toBe('/docs/b.md');
      expect(api.state.files.get('/docs/b.md')?.content).toBe('A');
      expect(lastToast()).toMatch(/unsaved edits of b\.md were kept/);
      expect(api.file.saveAs).toHaveBeenCalledTimes(1);
    });

    it('saves the edits to another location when the user chooses Save', async () => {
      const { a, b } = await setup();
      vi.mocked(api.app.confirmUnsaved).mockImplementationOnce(() => {
        api.state.saveAsPath = '/docs/c.md';
        return Promise.resolve('save');
      });
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(api.file.saveAs).toHaveBeenLastCalledWith(
        expect.objectContaining({ suggestedName: 'b.md', content: 'unsaved B' }),
      );
      expect(getDoc(b)).toMatchObject({ path: '/docs/c.md', title: 'c.md' });
      expect(api.state.files.get('/docs/c.md')?.content).toBe('unsaved B');
      expect(api.state.files.get('/docs/b.md')?.content).toBe('A');
    });

    it('keeps the edits when the second Save As is cancelled', async () => {
      const { a, b } = await setup();
      vi.mocked(api.app.confirmUnsaved).mockImplementationOnce(() => {
        api.state.saveAsPath = null;
        return Promise.resolve('save');
      });
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(getDoc(b)).toMatchObject({ path: null, content: 'unsaved B' });
      expect(lastToast()).toMatch(/were kept/);
    });

    it('keeps the edits when the prompt fails', async () => {
      const { a, b } = await setup();
      vi.mocked(api.app.confirmUnsaved).mockRejectedValueOnce(new Error('no dialog'));
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(useUi.getState().toasts.map((toast) => toast.message)).toContain(
        'Could not ask about unsaved changes.',
      );
      expect(getDoc(b)).toMatchObject({ path: null, content: 'unsaved B' });
    });

    it('copes with the overwritten tab disappearing while its editor is flushed', async () => {
      const { a, b } = await setup();
      const adapter = createFakeAdapter('wysiwyg', 'unsaved B');
      adapter.getMarkdown = () => {
        docs().close(b);
        return 'unsaved B';
      };
      setAdapter(b, adapter);
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(docs().documents.map((doc) => doc.id)).toEqual([a]);
      expect(api.app.confirmUnsaved).not.toHaveBeenCalled();
    });

    it('closes without asking when confirmations are off', async () => {
      const { a } = await setup();
      setSettings(api, { general: { confirmOnClose: false } });
      await expect(saveDocumentAs(a)).resolves.toBe(true);
      expect(api.app.confirmUnsaved).not.toHaveBeenCalled();
      expect(docs().documents).toHaveLength(1);
    });
  });

  it('does not double the extension when suggesting a name for detached tabs', async () => {
    await openPath('/docs/a.md');
    const id = docs().activeId!;
    docs().detach(id);
    await saveDocumentAs(id);
    expect(api.file.saveAs).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'a.md' }));
  });

  it('reports Save As failures', async () => {
    const id = createNewDocument();
    vi.mocked(api.file.saveAs).mockRejectedValueOnce(new Error('bad'));
    await expect(saveDocumentAs(id)).resolves.toBe(false);
    expect(lastToast()).toBe('Could not save Untitled-1');
  });

  it('saves all dirty documents', async () => {
    await openPath('/docs/a.md');
    await openPath('/docs/b.md');
    const [a] = docs().documents;
    docs().updateContent(a!.id, 'changed');
    await expect(saveAllDocuments()).resolves.toBe(true);
    expect(api.file.save).toHaveBeenCalledTimes(1);
    const untitled = createNewDocument();
    docs().updateContent(untitled, 'x');
    await expect(saveAllDocuments()).resolves.toBe(false);
  });

  it('resolves unsaved changes according to the user choice', async () => {
    await openPath('/docs/a.md');
    const id = docs().activeId!;
    await expect(resolveUnsaved('missing')).resolves.toBe(true);
    await expect(resolveUnsaved(id)).resolves.toBe(true);
    docs().updateContent(id, 'dirty');
    api.state.unsavedChoice = 'cancel';
    await expect(resolveUnsaved(id)).resolves.toBe(false);
    api.state.unsavedChoice = 'discard';
    await expect(resolveUnsaved(id)).resolves.toBe(true);
    api.state.unsavedChoice = 'save';
    await expect(resolveUnsaved(id)).resolves.toBe(true);
    expect(api.state.files.get('/docs/a.md')?.content).toBe('dirty');
    docs().updateContent(id, 'dirty again');
    vi.mocked(api.app.confirmUnsaved).mockRejectedValueOnce(new Error('no dialog'));
    await expect(resolveUnsaved(id)).resolves.toBe(false);
    expect(lastToast()).toBe('Could not ask about unsaved changes.');
    setSettings(api, { general: { confirmOnClose: false } });
    await expect(resolveUnsaved(id)).resolves.toBe(true);
  });

  it('closes documents after confirmation', async () => {
    await openPath('/docs/a.md');
    await openPath('/docs/b.md');
    const [a, b] = docs().documents;
    docs().updateContent(a!.id, 'dirty');
    api.state.unsavedChoice = 'cancel';
    await expect(closeDocument(a!.id)).resolves.toBe(false);
    await expect(closeAllDocuments()).resolves.toBe(false);
    expect(docs().documents).toHaveLength(2);
    api.state.unsavedChoice = 'discard';
    await expect(closeDocument(b!.id)).resolves.toBe(true);
    await expect(closeAllDocuments()).resolves.toBe(true);
    expect(docs().documents).toEqual([]);
  });

  it('exports HTML and PDF of the active document', async () => {
    await exportActiveDocument('html');
    expect(lastToast()).toBe('Open a document to export it.');
    await openPath('/docs/a.md');
    await exportActiveDocument('html');
    expect(api.file.exportHtml).toHaveBeenCalledWith({
      suggestedName: 'a.html',
      documentPath: '/docs/a.md',
      html: '<html>a</html>',
    });
    expect(lastToast()).toBe('Exported to /exports/a.html');
    await exportActiveDocument('pdf');
    expect(api.file.exportPdf).toHaveBeenCalledWith({
      suggestedName: 'a.pdf',
      documentPath: '/docs/a.md',
      html: '<html>a</html>',
    });
    vi.mocked(api.file.exportHtml).mockResolvedValueOnce(null);
    vi.mocked(api.file.exportPdf).mockResolvedValueOnce(null);
    await exportActiveDocument('html');
    const toasts = useUi.getState().toasts.length;
    await exportActiveDocument('pdf');
    expect(useUi.getState().toasts).toHaveLength(toasts);
    vi.mocked(api.file.exportHtml).mockRejectedValueOnce(new Error('write failed'));
    await exportActiveDocument('html');
    expect(lastToast()).toBe('Could not export HTML.');
  });

  it('passes theme and remote image settings to the exporter', async () => {
    const { buildStandaloneHtml } = await import('@renderer/export');
    setSettings(api, { rendering: { loadRemoteImages: false } });
    await openPath('/docs/a.md');
    await exportActiveDocument('html');
    expect(buildStandaloneHtml).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'a',
        markdown: 'A',
        documentPath: '/docs/a.md',
        loadRemoteImages: false,
      }),
    );
  });

  it('reveals saved documents only', async () => {
    await revealActiveDocument();
    expect(lastToast()).toBe('Save the document first to reveal it in its folder.');
    await openPath('/docs/a.md');
    await revealActiveDocument();
    expect(api.file.revealInFolder).toHaveBeenCalledWith('/docs/a.md');
    vi.mocked(api.file.revealInFolder).mockRejectedValueOnce(new Error('x'));
    await revealActiveDocument();
    expect(lastToast()).toBe('Could not reveal the file.');
  });

  it('reloads documents from disk', async () => {
    await openPath('/docs/a.md');
    const id = docs().activeId!;
    api.state.files.set('/docs/a.md', fakeFile('/docs/a.md', 'A2', { mtimeMs: 5 }));
    await expect(reloadDocument(id)).resolves.toBe(true);
    expect(selectActiveDocument(docs())).toMatchObject({ content: 'A2', revision: 1 });
    api.state.files.delete('/docs/a.md');
    await expect(reloadDocument(id)).resolves.toBe(false);
    expect(lastToast()).toBe('Could not reload a.md');
    await expect(reloadDocument(createNewDocument())).resolves.toBe(false);
    await expect(reloadDocument('missing')).resolves.toBe(false);
  });

  it('toggles line endings', () => {
    const id = createNewDocument();
    toggleLineEnding(id);
    expect(selectActiveDocument(docs())?.lineEnding).toBe('crlf');
    toggleLineEnding(id);
    expect(selectActiveDocument(docs())?.lineEnding).toBe('lf');
    toggleLineEnding('missing');
  });
});
