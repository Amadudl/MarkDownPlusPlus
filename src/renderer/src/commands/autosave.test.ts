import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp, setSettings } from '@renderer/test/utils';
import { useDocuments } from '@renderer/store/documents';
import { startAutoSave } from './autosave';

const docs = useDocuments.getState;

describe('auto save', () => {
  let api: FakeApi;
  let stop: () => void;
  beforeEach(() => {
    api = resetApp([fakeFile('/a.md', 'A')]);
    vi.useFakeTimers();
    stop = startAutoSave();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('does nothing when disabled', async () => {
    const id = docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    docs().updateContent(id, 'x');
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.file.save).not.toHaveBeenCalled();
  });

  it('saves after the configured delay, debounced per document', async () => {
    setSettings(api, { editor: { autoSave: 'afterDelay', autoSaveDelayMs: 1000 } });
    const id = docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    const untitled = docs().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    docs().updateContent(untitled, 'never auto saved');
    docs().updateContent(id, 'x');
    await vi.advanceTimersByTimeAsync(600);
    docs().updateContent(id, 'xy');
    await vi.advanceTimersByTimeAsync(600);
    expect(api.file.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(api.file.save).toHaveBeenCalledTimes(1);
    expect(api.file.save).toHaveBeenCalledWith(expect.objectContaining({ content: 'xy' }));
    expect(api.file.saveAs).not.toHaveBeenCalled();
  });

  it('skips documents that became clean, closed or conflicted before the timer fired', async () => {
    setSettings(api, { editor: { autoSave: 'afterDelay', autoSaveDelayMs: 500 } });
    const id = docs().openFile(fakeFile('/a.md', 'A'), 'wysiwyg');
    docs().updateContent(id, 'x');
    docs().updateContent(id, 'A');
    docs().setExternalChange(id, 'changed');
    docs().setLineEnding(id, 'crlf');
    await vi.advanceTimersByTimeAsync(600);
    const other = docs().openFile(fakeFile('/b.md', 'B'), 'wysiwyg');
    docs().updateContent(other, 'y');
    docs().close(other);
    await vi.advanceTimersByTimeAsync(600);
    expect(api.file.save).not.toHaveBeenCalled();
  });

  it('saves dirty documents when the window loses focus', async () => {
    setSettings(api, { editor: { autoSave: 'onFocusChange' } });
    const id = docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    docs().openFile(fakeFile('/b.md'), 'wysiwyg');
    docs().updateContent(id, 'changed');
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.file.save).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.file.save).toHaveBeenCalledTimes(1);
  });

  it('clears pending timers on stop', async () => {
    setSettings(api, { editor: { autoSave: 'afterDelay', autoSaveDelayMs: 500 } });
    const id = docs().openFile(fakeFile('/a.md'), 'wysiwyg');
    docs().updateContent(id, 'x');
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.file.save).not.toHaveBeenCalled();
  });
});
