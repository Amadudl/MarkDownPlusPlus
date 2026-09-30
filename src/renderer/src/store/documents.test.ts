import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFile } from '@renderer/test/fakeApi';
import { INITIAL_DOCUMENTS_STATE, isDirty, samePath, selectActiveDocument, useDocuments } from './documents';

const store = useDocuments.getState;

describe('documents store', () => {
  beforeEach(() => useDocuments.setState({ ...INITIAL_DOCUMENTS_STATE }));

  it('creates numbered untitled documents and activates them', () => {
    const first = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const second = store().newDocument({ mode: 'source', lineEnding: 'crlf' });
    const docs = store().documents;
    expect(docs.map((doc) => doc.title)).toEqual(['Untitled-1', 'Untitled-2']);
    expect(docs[1]).toMatchObject({ mode: 'source', lineEnding: 'crlf', path: null, content: '' });
    expect(store().activeId).toBe(second);
    expect(first).not.toBe(second);
  });

  it('keeps the counter when a custom title is given', () => {
    store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf', title: 'Welcome', content: '# Hi' });
    store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    expect(store().documents.map((doc) => doc.title)).toEqual(['Welcome', 'Untitled-1']);
    expect(isDirty(store().documents[0]!)).toBe(false);
  });

  it('opens files once and re-activates an already open path', () => {
    const a = store().openFile(fakeFile('/docs/a.md'), 'source');
    const b = store().openFile(fakeFile('/docs/b.md', 'b', { lineEnding: 'crlf', hasBom: true }), 'wysiwyg');
    expect(store().activeId).toBe(b);
    expect(store().openFile(fakeFile('/docs/a.md'), 'wysiwyg')).toBe(a);
    expect(store().activeId).toBe(a);
    expect(store().documents).toHaveLength(2);
    expect(store().documents[1]).toMatchObject({
      title: 'b.md',
      lineEnding: 'crlf',
      hasBom: true,
      mode: 'wysiwyg',
    });
    expect(store().findByPath('/docs/b.md')?.id).toBe(b);
    expect(store().findByPath('/docs/c.md')).toBeUndefined();
  });

  it('compares Windows paths case-insensitively', () => {
    expect(samePath('C:\\Docs\\A.md', 'c:/docs/a.md')).toBe(true);
    expect(samePath('/Docs/A.md', '/docs/a.md')).toBe(false);
    store().openFile(fakeFile('C:\\Docs\\A.md'), 'wysiwyg');
    expect(store().findByPath('c:\\docs\\a.md')).toBeDefined();
  });

  it('activates only existing documents', () => {
    const a = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().activate(a);
    expect(store().activeId).toBe(a);
    store().activate('missing');
    expect(store().activeId).toBe(a);
  });

  it('closes tabs and activates the neighbour', () => {
    const a = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const b = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const c = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().activate(b);
    store().close(b);
    expect(store().activeId).toBe(c);
    store().close(c);
    expect(store().activeId).toBe(a);
    store().close('missing');
    expect(store().documents).toHaveLength(1);
    const d = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().activate(a);
    store().close(d);
    expect(store().activeId).toBe(a);
    store().close(a);
    expect(store().activeId).toBeNull();
  });

  it('closes all documents', () => {
    store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().closeAll();
    expect(store().documents).toEqual([]);
    expect(store().activeId).toBeNull();
  });

  it('reorders tabs', () => {
    const a = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const b = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const c = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().reorder(c, a);
    expect(store().documents.map((doc) => doc.id)).toEqual([c, a, b]);
    store().reorder(c, b);
    expect(store().documents.map((doc) => doc.id)).toEqual([a, b, c]);
    const before = store().documents;
    store().reorder(a, a);
    store().reorder('x', a);
    store().reorder(a, 'x');
    expect(store().documents).toBe(before);
  });

  it('tracks content, dirty state and saving', () => {
    const id = store().openFile(fakeFile('/a.md', 'one'), 'wysiwyg');
    const unchanged = store().documents;
    store().updateContent(id, 'one');
    expect(store().documents[0]).toBe(unchanged[0]);
    store().updateContent(id, 'two');
    expect(isDirty(selectActiveDocument(store())!)).toBe(true);
    store().markSaved(id, { path: '/b.md', mtimeMs: 5, content: 'two' });
    const saved = selectActiveDocument(store())!;
    expect(saved).toMatchObject({ path: '/b.md', title: 'b.md', savedContent: 'two', mtimeMs: 5 });
    expect(isDirty(saved)).toBe(false);
  });

  it('treats a changed line ending as unsaved', () => {
    const id = store().openFile(fakeFile('/a.md'), 'wysiwyg');
    store().setLineEnding(id, 'crlf');
    expect(isDirty(store().documents[0]!)).toBe(true);
    store().markSaved(id, { path: '/a.md', mtimeMs: 2, content: '# Hello\n' });
    expect(store().documents[0]).toMatchObject({ savedLineEnding: 'crlf' });
    expect(isDirty(store().documents[0]!)).toBe(false);
  });

  it('sets the mode and external change state', () => {
    const id = store().openFile(fakeFile('/a.md'), 'wysiwyg');
    store().setMode(id, 'source');
    store().setExternalChange(id, 'changed');
    expect(store().documents[0]).toMatchObject({ mode: 'source', externalChange: 'changed' });
  });

  it('keeps deleted files dirty until saved', () => {
    const id = store().openFile(fakeFile('/a.md'), 'wysiwyg');
    store().setExternalChange(id, 'deleted');
    store().keepDeleted(id);
    expect(store().documents[0]).toMatchObject({ externalChange: 'none', diskMissing: true });
    expect(isDirty(store().documents[0]!)).toBe(true);
    store().markSaved(id, { path: '/a.md', mtimeMs: 3, content: '# Hello\n' });
    expect(isDirty(store().documents[0]!)).toBe(false);
  });

  it('detaches a document from its file and keeps its content unsaved', () => {
    const id = store().openFile(fakeFile('/a.md', 'disk'), 'wysiwyg');
    store().updateContent(id, 'mine');
    store().setExternalChange(id, 'changed');
    store().detach(id);
    expect(store().documents[0]).toMatchObject({
      path: null,
      title: 'a.md',
      content: 'mine',
      externalChange: 'none',
      diskMissing: false,
    });
    expect(isDirty(store().documents[0]!)).toBe(true);
    expect(store().findByPath('/a.md')).toBeUndefined();
  });

  it('reloads from disk and bumps the revision', () => {
    const id = store().openFile(fakeFile('/a.md', 'old'), 'wysiwyg');
    store().updateContent(id, 'mine');
    store().setExternalChange(id, 'changed');
    store().reloadFromDisk(id, fakeFile('/a.md', 'theirs', { lineEnding: 'crlf', mtimeMs: 9, hasBom: true }));
    expect(store().documents[0]).toMatchObject({
      content: 'theirs',
      savedContent: 'theirs',
      lineEnding: 'crlf',
      hasBom: true,
      mtimeMs: 9,
      externalChange: 'none',
      revision: 1,
    });
  });

  it('cycles through tabs in both directions', () => {
    store().nextTab();
    expect(store().activeId).toBeNull();
    const a = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    const b = store().newDocument({ mode: 'wysiwyg', lineEnding: 'lf' });
    store().nextTab();
    expect(store().activeId).toBe(a);
    store().previousTab();
    expect(store().activeId).toBe(b);
    useDocuments.setState({ activeId: null });
    store().nextTab();
    expect(store().activeId).toBe(a);
    useDocuments.setState({ activeId: null });
    store().previousTab();
    expect(store().activeId).toBe(b);
  });
});
