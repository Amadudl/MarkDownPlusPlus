import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => '/home/me/Documents') },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
}));
vi.mock('electron', () => electron);

const {
  confirmReload,
  confirmUnsaved,
  sanitizeFileName,
  showExportDialog,
  showOpenMarkdownDialog,
  showSaveMarkdownDialog,
} = await import('./dialogs');

const parent = { id: 1 } as never;

beforeEach(() => {
  for (const fn of Object.values(electron.dialog)) fn.mockReset();
});

describe('sanitizeFileName', () => {
  it('keeps good names and appends missing extensions', () => {
    expect(sanitizeFileName('Notes.md', '.md')).toBe('Notes.md');
    expect(sanitizeFileName('Notes', '.md')).toBe('Notes.md');
    expect(sanitizeFileName('Notes.markdown', '.md', ['.md', '.markdown'])).toBe('Notes.markdown');
    expect(sanitizeFileName('Report.MD', '.md')).toBe('Report.MD');
  });

  it('removes paths, reserved characters and trailing dots', () => {
    expect(sanitizeFileName('../../etc/passwd', '.md')).toBe('passwd.md');
    expect(sanitizeFileName('C:\\Windows\\evil', '.md')).toBe('evil.md');
    expect(sanitizeFileName('a<b>c:d"e|f?g*h\u0001', '.md')).toBe('abcdefgh.md');
    expect(sanitizeFileName('name. . .', '.md')).toBe('name.md');
    expect(sanitizeFileName('x'.repeat(300), '.md')).toHaveLength(203);
  });

  it('falls back to Untitled', () => {
    expect(sanitizeFileName('', '.md')).toBe('Untitled.md');
    expect(sanitizeFileName('???', '.pdf')).toBe('Untitled.pdf');
  });
});

describe('showOpenMarkdownDialog', () => {
  it('returns the chosen files, with or without a parent', async () => {
    electron.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/a.md', '/b.md'] });
    expect(await showOpenMarkdownDialog(parent)).toEqual(['/a.md', '/b.md']);
    expect(electron.dialog.showOpenDialog).toHaveBeenCalledWith(
      parent,
      expect.objectContaining({ properties: ['openFile', 'multiSelections'] }),
    );
    const options = electron.dialog.showOpenDialog.mock.calls[0]?.[1] as { filters: { name: string }[] };
    expect(options.filters.map((filter) => filter.name)).toEqual(['Markdown', 'Text', 'All Files']);
    expect(await showOpenMarkdownDialog(null)).toEqual(['/a.md', '/b.md']);
    expect(electron.dialog.showOpenDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: expect.any(String) }),
    );
  });

  it('returns nothing when cancelled', async () => {
    electron.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await showOpenMarkdownDialog(parent)).toEqual([]);
  });
});

describe('showSaveMarkdownDialog', () => {
  it('suggests a sanitised .md name in the documents folder', async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/home/me/Documents/x.md',
    });
    expect(await showSaveMarkdownDialog(parent, 'My/Notes')).toBe('/home/me/Documents/x.md');
    expect(electron.dialog.showSaveDialog).toHaveBeenCalledWith(
      parent,
      expect.objectContaining({ defaultPath: '/home/me/Documents/Notes.md' }),
    );
    await showSaveMarkdownDialog(null, 'draft.markdown');
    expect(electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: '/home/me/Documents/draft.markdown' }),
    );
  });

  it('starts in the folder of the document when one is given', async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
    await showSaveMarkdownDialog(parent, 'spec.md', '/work/project/docs');
    expect(electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(
      parent,
      expect.objectContaining({ defaultPath: '/work/project/docs/spec.md' }),
    );
  });

  it('returns null when cancelled or empty', async () => {
    electron.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' });
    expect(await showSaveMarkdownDialog(parent, 'x')).toBeNull();
    electron.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '' });
    expect(await showSaveMarkdownDialog(parent, 'x')).toBeNull();
  });
});

describe('showExportDialog', () => {
  it('replaces the markdown extension with the export format', async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/out/doc.pdf' });
    expect(await showExportDialog(parent, 'doc.md', 'pdf')).toBe('/out/doc.pdf');
    expect(electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(
      parent,
      expect.objectContaining({ defaultPath: '/home/me/Documents/doc.pdf', title: 'Export as PDF' }),
    );
    await showExportDialog(null, 'page.htm', 'html');
    expect(electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: '/home/me/Documents/page.htm', title: 'Export as HTML' }),
    );
  });

  it('starts next to the exported document when its folder is given', async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/work/spec.pdf' });
    await showExportDialog(parent, 'spec.md', 'pdf', '/work');
    expect(electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(
      parent,
      expect.objectContaining({ defaultPath: '/work/spec.pdf' }),
    );
  });

  it('starts in the folder of the document when one is given', async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
    await showSaveMarkdownDialog(parent, 'spec.md', '/work/project/docs');
    expect(electron.dialog.showSaveDialog).toHaveBeenLastCalledWith(
      parent,
      expect.objectContaining({ defaultPath: '/work/project/docs/spec.md' }),
    );
  });

  it('returns null when cancelled or empty', async () => {
    electron.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' });
    expect(await showExportDialog(parent, 'x', 'html')).toBeNull();
    electron.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '' });
    expect(await showExportDialog(parent, 'x', 'html')).toBeNull();
  });
});

describe('confirmUnsaved', () => {
  it.each([
    [0, 'save'],
    [1, 'discard'],
    [2, 'cancel'],
    [7, 'cancel'],
  ])('maps button %i to %s', async (response, choice) => {
    electron.dialog.showMessageBox.mockResolvedValue({ response });
    expect(await confirmUnsaved(parent, 'Notes.md')).toBe(choice);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(
      parent,
      expect.objectContaining({ buttons: ['Save', "Don't Save", 'Cancel'], cancelId: 2 }),
    );
  });

  it('works without a parent window', async () => {
    electron.dialog.showMessageBox.mockResolvedValue({ response: 1 });
    expect(await confirmUnsaved(null, 'x')).toBe('discard');
    expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });
});

describe('confirmReload', () => {
  it('returns true only for Reload', async () => {
    electron.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await confirmReload(parent, 'a.md')).toBe(true);
    electron.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await confirmReload(null, 'a.md')).toBe(false);
  });
});
