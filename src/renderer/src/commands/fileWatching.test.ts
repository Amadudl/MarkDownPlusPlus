import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { flush, resetApp } from '@renderer/test/utils';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { handleFileChanged, startFileWatching } from './fileWatching';

const docs = useDocuments.getState;

describe('file watching', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A')]);
  });

  it('watches and unwatches open paths', () => {
    docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    const stop = startFileWatching();
    expect(api.file.watch).toHaveBeenCalledWith('/a.md');
    const b = docs().openFile(fakeFile('/b.md'), 'wysiwyg');
    docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    expect(api.file.watch).toHaveBeenCalledTimes(2);
    docs().close(b);
    expect(api.file.unwatch).toHaveBeenCalledWith('/b.md');
    stop();
    expect(api.file.unwatch).toHaveBeenCalledWith('/a.md');
    expect(api.listenerCounts().fileChanged).toBe(0);
  });

  it('logs watcher errors instead of failing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(api.file.watch).mockRejectedValueOnce(new Error('EMFILE'));
    const stop = startFileWatching();
    docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    await flush();
    expect(warn).toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });

  it('ignores unknown paths and our own saves', async () => {
    await handleFileChanged({ path: '/nope.md', kind: 'changed', mtimeMs: 5 });
    docs().openFile(fakeFile('/a.md', 'A', { mtimeMs: 1000 }), 'wysiwyg');
    await handleFileChanged({ path: '/a.md', kind: 'changed', mtimeMs: 1000 });
    expect(api.file.read).not.toHaveBeenCalled();
  });

  it('reloads clean documents silently and flags dirty ones', async () => {
    const id = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    api.state.files.set('/a.md', fakeFile('/a.md', 'A2', { mtimeMs: 2000 }));
    const stop = startFileWatching();
    api.emit.fileChanged({ path: '/a.md', kind: 'changed', mtimeMs: 2000 });
    await vi.waitFor(() => expect(docs().documents[0]?.content).toBe('A2'));
    expect(useUi.getState().toasts[0]?.message).toBe('a.md was updated from disk.');
    docs().updateContent(id, 'mine');
    await handleFileChanged({ path: '/a.md', kind: 'changed', mtimeMs: 3000 });
    expect(docs().documents[0]).toMatchObject({ content: 'mine', externalChange: 'changed' });
    stop();
  });

  it('flags deleted files and stays quiet when a reload fails', async () => {
    docs().openFile(fakeFile('/gone.md'), 'wysiwyg');
    await handleFileChanged({ path: '/gone.md', kind: 'changed', mtimeMs: 5 });
    expect(useUi.getState().toasts.map((toast) => toast.message)).toEqual(['Could not reload gone.md']);
    await handleFileChanged({ path: '/gone.md', kind: 'deleted', mtimeMs: 0 });
    expect(docs().documents[0]?.externalChange).toBe('deleted');
  });
});
