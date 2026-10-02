import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp, setSettings } from '@renderer/test/utils';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import {
  bindAppEvents,
  currentSession,
  handleCloseRequest,
  saveSession,
  SESSION_SAVE_DELAY_MS,
  startSessionPersistence,
  startup,
} from './session';

const docs = useDocuments.getState;

describe('session', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A'), fakeFile('/b.md', 'B')]);
  });

  it('captures open files and the active one', () => {
    expect(currentSession()).toEqual({ documents: [], activePath: null });
    docs().openFile(fakeFile('/a.md'), 'source');
    docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    expect(currentSession()).toEqual({ documents: [{ path: '/a.md', mode: 'source' }], activePath: null });
    docs().activate(docs().documents[0]!.id);
    expect(currentSession().activePath).toBe('/a.md');
  });

  it('saves an empty session when restoring is disabled', async () => {
    docs().openFile(fakeFile('/a.md'), 'source');
    await saveSession();
    expect(api.state.session?.documents).toHaveLength(1);
    setSettings(api, { editor: { restoreSession: false } });
    await saveSession();
    expect(api.state.session).toEqual({ documents: [], activePath: null });
  });

  it('starts up: settings, app info, session restore and pending files', async () => {
    api.state.settings = {
      ...api.state.settings,
      general: { ...api.state.settings.general, showOutline: true },
    };
    api.state.info = { ...api.state.info, platform: 'darwin' };
    api.state.session = {
      documents: [
        { path: '/a.md', mode: 'source' },
        { path: '/gone.md', mode: 'wysiwyg' },
        { path: '/b.md', mode: 'wysiwyg' },
      ],
      activePath: '/a.md',
    };
    api.state.pending = [fakeFile('/c.md', 'C')];
    await startup();
    expect(useSettings.getState().loaded).toBe(true);
    expect(useUi.getState()).toMatchObject({ outlineVisible: true, platform: 'darwin' });
    expect(useUi.getState().appInfo?.platform).toBe('darwin');
    expect(docs().documents.map((doc) => doc.path)).toEqual(['/a.md', '/b.md', '/c.md']);
    expect(docs().documents[0]?.mode).toBe('source');
    expect(selectActiveDocument(docs())?.path).toBe('/c.md');
    expect(useUi.getState().toasts[0]).toMatchObject({
      kind: 'warning',
      message: 'gone.md could not be reopened.',
    });
  });

  it('activates the session active path and reports several missing files', async () => {
    api.state.session = {
      documents: [
        { path: '/a.md', mode: 'wysiwyg' },
        { path: '/b.md', mode: 'wysiwyg' },
        { path: '/x.md', mode: 'wysiwyg' },
        { path: '/y.md', mode: 'wysiwyg' },
      ],
      activePath: '/a.md',
    };
    await startup();
    expect(selectActiveDocument(docs())?.path).toBe('/a.md');
    expect(useUi.getState().toasts[0]?.message).toBe('2 files could not be reopened.');
  });

  it('restores a session without an active path', async () => {
    api.state.session = { documents: [{ path: '/a.md', mode: 'wysiwyg' }], activePath: null };
    await startup();
    expect(selectActiveDocument(docs())?.path).toBe('/a.md');
  });

  it('ignores an active path that could not be restored', async () => {
    api.state.session = { documents: [{ path: '/a.md', mode: 'wysiwyg' }], activePath: '/gone.md' };
    await startup();
    expect(selectActiveDocument(docs())?.path).toBe('/a.md');
  });

  it('skips the session when disabled and opens an empty document without welcome screen', async () => {
    api.state.settings = {
      ...api.state.settings,
      editor: { ...api.state.settings.editor, restoreSession: false },
      general: { ...api.state.settings.general, showWelcome: false },
    };
    api.state.session = { documents: [{ path: '/a.md', mode: 'wysiwyg' }], activePath: null };
    await startup();
    expect(api.session.load).not.toHaveBeenCalled();
    expect(docs().documents.map((doc) => doc.title)).toEqual(['Untitled-1']);
  });

  it('keeps the welcome screen when nothing is open', async () => {
    await startup();
    expect(docs().documents).toEqual([]);
  });

  it('reports startup failures without aborting', async () => {
    vi.mocked(api.app.info).mockRejectedValueOnce(new Error('info'));
    vi.mocked(api.session.load).mockRejectedValueOnce(new Error('session'));
    vi.mocked(api.app.takePendingFiles).mockRejectedValueOnce(new Error('pending'));
    await startup();
    expect(useUi.getState().toasts.map((toast) => toast.message)).toEqual([
      'Could not read application info.',
      'Could not restore the previous session.',
      'Could not open the requested files.',
    ]);
  });

  it('runs the close handshake', async () => {
    docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    await expect(handleCloseRequest()).resolves.toBe(true);
    expect(api.session.save).toHaveBeenCalled();
    expect(api.app.closeReady).toHaveBeenCalledTimes(1);
  });

  it('aborts the close when the user cancels', async () => {
    const id = docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    docs().updateContent(id, 'dirty');
    api.state.unsavedChoice = 'cancel';
    await expect(handleCloseRequest()).resolves.toBe(false);
    expect(api.app.closeReady).not.toHaveBeenCalled();
    expect(api.app.closeCancelled).toHaveBeenCalledTimes(1);
    api.state.unsavedChoice = 'save';
    await expect(handleCloseRequest()).resolves.toBe(true);
    expect(api.state.files.get('/a.md')?.content).toBe('dirty');
  });

  it('still aborts the close when the main process cannot be told', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    docs().updateContent(id, 'dirty');
    api.state.unsavedChoice = 'cancel';
    vi.mocked(api.app.closeCancelled).mockRejectedValueOnce(new Error('ipc'));
    await expect(handleCloseRequest()).resolves.toBe(false);
    expect(api.app.closeReady).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith('Could not cancel the window close', expect.any(Error));
    errors.mockRestore();
  });

  it('ignores re-entrant close requests and still closes when the session cannot be saved', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(api.session.save).mockRejectedValueOnce(new Error('disk'));
    const first = handleCloseRequest();
    await expect(handleCloseRequest()).resolves.toBe(false);
    await expect(first).resolves.toBe(true);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('binds open-files and close events', async () => {
    const stop = bindAppEvents();
    api.emit.openFiles([fakeFile('/z.md')]);
    expect(selectActiveDocument(docs())?.path).toBe('/z.md');
    api.emit.closeRequested();
    await vi.waitFor(() => expect(api.app.closeReady).toHaveBeenCalled());
    stop();
    expect(api.listenerCounts()).toMatchObject({ openFiles: 0, closeRequested: 0 });
  });
});

describe('continuous session persistence', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A'), fakeFile('/b.md', 'B')]);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const settle = () => vi.advanceTimersByTimeAsync(SESSION_SAVE_DELAY_MS);

  it('writes nothing before startup has restored the previous session', async () => {
    let finishStartup!: () => void;
    const stop = startSessionPersistence(new Promise<void>((resolve) => (finishStartup = resolve)));
    docs().openFile(fakeFile('/a.md'), 'source');
    await settle();
    expect(api.session.save).not.toHaveBeenCalled();
    finishStartup();
    await settle();
    expect(api.session.save).toHaveBeenCalledTimes(1);
    expect(api.state.session).toEqual({
      documents: [{ path: '/a.md', mode: 'source' }],
      activePath: '/a.md',
    });
    stop();
  });

  it('saves opening, switching and closing tabs, debounced and only when the session changed', async () => {
    const stop = startSessionPersistence(Promise.resolve());
    await settle();
    expect(api.state.session).toEqual({ documents: [], activePath: null });
    docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    docs().openFile(fakeFile('/b.md'), 'wysiwyg');
    await settle();
    expect(api.session.save).toHaveBeenCalledTimes(2);
    expect(api.state.session?.documents.map((doc) => doc.path)).toEqual(['/a.md', '/b.md']);
    expect(api.state.session?.activePath).toBe('/b.md');

    // Typing changes the document but not the session: no write.
    const [first, second] = docs().documents;
    docs().updateContent(second!.id, 'B edited');
    await settle();
    expect(api.session.save).toHaveBeenCalledTimes(2);

    docs().setMode(first!.id, 'source');
    docs().activate(first!.id);
    await settle();
    expect(api.state.session).toEqual({
      documents: [
        { path: '/a.md', mode: 'source' },
        { path: '/b.md', mode: 'wysiwyg' },
      ],
      activePath: '/a.md',
    });
    docs().close(second!.id);
    await settle();
    expect(api.state.session?.documents.map((doc) => doc.path)).toEqual(['/a.md']);
    expect(api.session.save).toHaveBeenCalledTimes(4);
    stop();
  });

  it('stores an empty session as soon as restoring is turned off', async () => {
    docs().openFile(fakeFile('/a.md'), 'source');
    const stop = startSessionPersistence(Promise.resolve());
    await settle();
    expect(api.state.session?.documents).toHaveLength(1);
    setSettings(api, { editor: { restoreSession: false } });
    await settle();
    expect(api.state.session).toEqual({ documents: [], activePath: null });
    stop();
  });

  it('starts even when startup failed', async () => {
    docs().openFile(fakeFile('/a.md'), 'source');
    const stop = startSessionPersistence(Promise.reject(new Error('startup failed')));
    await settle();
    expect(api.state.session?.documents).toHaveLength(1);
    stop();
  });

  it('retries after a failed write instead of assuming it was saved', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(api.session.save).mockRejectedValueOnce(new Error('disk full'));
    docs().openFile(fakeFile('/a.md'), 'source');
    const stop = startSessionPersistence(Promise.resolve());
    await settle();
    expect(error).toHaveBeenCalledWith('Could not save the session', expect.any(Error));
    expect(api.state.session).toBeNull();
    // The next change (even back and forth to the same session) writes again.
    docs().activate(docs().documents[0]!.id);
    useDocuments.setState({ activeId: null });
    useDocuments.setState({ activeId: docs().documents[0]!.id });
    await settle();
    expect(api.state.session?.documents).toHaveLength(1);
    error.mockRestore();
    stop();
  });

  it('stops listening and drops a pending write when stopped', async () => {
    const stop = startSessionPersistence(Promise.resolve());
    await settle();
    vi.mocked(api.session.save).mockClear();
    docs().openFile(fakeFile('/a.md'), 'source');
    stop();
    await settle();
    docs().openFile(fakeFile('/b.md'), 'source');
    await settle();
    expect(api.session.save).not.toHaveBeenCalled();
  });
});
