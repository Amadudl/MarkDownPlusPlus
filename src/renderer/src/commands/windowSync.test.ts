import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFile, type FakeApi } from '@renderer/test/fakeApi';
import { flush, resetApp, setSettings } from '@renderer/test/utils';
import { useDocuments } from '@renderer/store/documents';
import { useUi } from '@renderer/store/ui';
import { APP_NAME, startAppearanceSync, startWindowTitleSync, windowTitle } from './windowSync';

const docs = useDocuments.getState;

describe('window title', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
  });

  it('formats the title from the active document', () => {
    expect(windowTitle(docs())).toBe(APP_NAME);
    const id = docs().openFile(fakeFile('/notes.md'), 'wysiwyg');
    expect(windowTitle(docs())).toBe('notes.md — MarkDown++');
    docs().updateContent(id, 'x');
    expect(windowTitle(docs())).toBe('● notes.md — MarkDown++');
  });

  it('pushes title and dirty state only when they change', async () => {
    const stop = startWindowTitleSync();
    expect(api.app.setTitle).toHaveBeenLastCalledWith(APP_NAME);
    expect(api.app.setDirty).toHaveBeenLastCalledWith(false);
    const id = docs().openFile(fakeFile('/notes.md'), 'wysiwyg');
    docs().setMode(id, 'source');
    expect(api.app.setTitle).toHaveBeenCalledTimes(2);
    expect(document.title).toBe('notes.md — MarkDown++');
    docs().updateContent(id, 'x');
    expect(api.app.setDirty).toHaveBeenLastCalledWith(true);
    expect(api.app.setDirty).toHaveBeenCalledTimes(2);
    stop();
    docs().updateContent(id, 'y');
    expect(api.app.setTitle).toHaveBeenCalledTimes(3);
    await flush();
  });

  it('logs failures of the native title API', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(api.app.setTitle).mockRejectedValueOnce(new Error('gone'));
    const stop = startWindowTitleSync();
    await flush();
    expect(warn).toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });
});

describe('appearance sync', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
  });

  it('applies theme variables, attributes and zoom and follows changes', () => {
    const root = document.createElement('div');
    const stop = startAppearanceSync(root);
    expect(root.getAttribute('data-mpp-theme-kind')).toBe('dark');
    expect(root.style.getPropertyValue('--mpp-zoom')).toBe('1');
    expect(root.style.getPropertyValue('--mpp-ui-background')).not.toBe('');
    useUi.getState().setPrefersDark(false);
    expect(root.getAttribute('data-mpp-theme-kind')).toBe('light');
    setSettings(api, { appearance: { zoom: 1.5 } });
    expect(root.style.getPropertyValue('--mpp-zoom')).toBe('1.5');
    const setAttribute = vi.spyOn(root, 'setAttribute');
    useUi.getState().setDropActive(true);
    expect(setAttribute).not.toHaveBeenCalled();
    stop();
    setSettings(api, { appearance: { zoom: 2 } });
    expect(root.style.getPropertyValue('--mpp-zoom')).toBe('1.5');
  });

  it('defaults to the document element', () => {
    const stop = startAppearanceSync();
    expect(document.documentElement.getAttribute('data-mpp-ui-theme')).toBeTruthy();
    stop();
  });
});
