import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeApi } from '@renderer/test/fakeApi';
import { createFakeAdapter } from '@renderer/test/fakeEditor';
import { resetApp, setSettings } from '@renderer/test/utils';
import { setAdapter } from '@renderer/store/adapters';
import { selectActiveDocument, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import {
  clampZoom,
  resetZoom,
  runFormat,
  runHistory,
  setActiveMode,
  toggleActiveMode,
  toggleOutline,
  zoomBy,
} from './viewActions';

describe('view actions', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
  });

  it('clamps and rounds zoom factors', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(5)).toBe(3);
    expect(clampZoom(1.1000000001)).toBe(1.1);
  });

  it('zooms in, out and resets through the settings', async () => {
    await zoomBy(0.1);
    expect(useSettings.getState().settings.appearance.zoom).toBe(1.1);
    await zoomBy(-0.2);
    expect(useSettings.getState().settings.appearance.zoom).toBe(0.9);
    await resetZoom();
    expect(useSettings.getState().settings.appearance.zoom).toBe(1);
    const calls = vi.mocked(api.settings.set).mock.calls.length;
    await resetZoom();
    setSettings(api, { appearance: { zoom: 3 } });
    await zoomBy(0.1);
    expect(api.settings.set).toHaveBeenCalledTimes(calls);
  });

  it('switches the mode of the active document', () => {
    setActiveMode('source');
    toggleActiveMode();
    const id = useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    setActiveMode('source');
    expect(selectActiveDocument(useDocuments.getState())?.mode).toBe('source');
    const before = useDocuments.getState().documents;
    setActiveMode('source');
    expect(useDocuments.getState().documents).toBe(before);
    toggleActiveMode();
    expect(useDocuments.getState().documents.find((doc) => doc.id === id)?.mode).toBe('wysiwyg');
    toggleActiveMode();
    expect(selectActiveDocument(useDocuments.getState())?.mode).toBe('source');
  });

  it('toggles and persists the outline', async () => {
    await toggleOutline();
    expect(useUi.getState().outlineVisible).toBe(true);
    expect(useSettings.getState().settings.general.showOutline).toBe(true);
    await toggleOutline();
    expect(useUi.getState().outlineVisible).toBe(false);
  });

  it('runs formatting commands on the active editor', () => {
    expect(runFormat('bold')).toBe(false);
    const id = useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const adapter = createFakeAdapter('wysiwyg', '');
    setAdapter(id, adapter);
    expect(runFormat('bold')).toBe(true);
    expect(adapter.commands).toEqual(['bold']);
    expect(adapter.focusCount).toBe(1);
  });

  it('routes undo/redo to the editor or to focused text fields', () => {
    expect(runHistory('undo')).toBe(false);
    const id = useDocuments.getState().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const adapter = createFakeAdapter('wysiwyg', '');
    setAdapter(id, adapter);
    expect(runHistory('undo')).toBe(true);
    expect(runHistory('redo')).toBe(true);
    expect([adapter.undoCount, adapter.redoCount]).toEqual([1, 1]);

    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(runHistory('undo')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('undo');
    input.type = 'checkbox';
    expect(runHistory('redo')).toBe(true);
    expect(adapter.redoCount).toBe(2);
    input.remove();
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    textarea.focus();
    runHistory('redo');
    expect(execCommand).toHaveBeenCalledWith('redo');
    textarea.remove();
  });
});
