import { useCallback, useMemo, type CSSProperties, type JSX } from 'react';
import type { CursorInfo, EditorAdapter } from '@renderer/editor/types';
import { EditorHost, type EditorHostProps } from '@renderer/editor/EditorHost';
import { setAdapter } from '@renderer/store/adapters';
import { useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { ExternalChangeBanner } from './ExternalChangeBanner';
import { resolveSourceFont } from './settings/SourceFontField';

/** Placeholder shown in empty documents. */
export const EDITOR_PLACEHOLDER = 'Start writing… type / for blocks';

/**
 * Hosts one editor per open document. Only the active one is visible; the
 * others stay mounted so undo history, selection and scroll position survive
 * tab switches.
 */
export function EditorArea(): JSX.Element {
  const documents = useDocuments((state) => state.documents);
  const activeId = useDocuments((state) => state.activeId);
  const editor = useSettings((state) => state.settings.editor);
  const loadRemoteImages = useSettings((state) => state.settings.rendering.loadRemoteImages);

  const options = useMemo<EditorHostProps['options']>(
    () => ({
      spellcheck: editor.spellcheck,
      tabSize: editor.tabSize,
      wordWrap: editor.wordWrap,
      lineNumbers: editor.sourceLineNumbers,
      loadRemoteImages,
      placeholder: EDITOR_PLACEHOLDER,
    }),
    [editor.spellcheck, editor.tabSize, editor.wordWrap, editor.sourceLineNumbers, loadRemoteImages],
  );

  const style = {
    '--mpp-source-font-family': resolveSourceFont(editor.sourceFontFamily),
    '--mpp-source-font-size': `${editor.sourceFontSize}px`,
  } as CSSProperties;

  const onChange = useCallback((docId: string, markdown: string) => {
    useDocuments.getState().updateContent(docId, markdown);
  }, []);
  const onCursorChange = useCallback((docId: string, info: CursorInfo) => {
    useUi.getState().setCursor(docId, info);
  }, []);
  const onAdapter = useCallback((docId: string, adapter: EditorAdapter | null) => {
    setAdapter(docId, adapter);
  }, []);

  return (
    <div className="editor-area" style={style}>
      {documents.map((doc) => {
        const active = doc.id === activeId;
        return (
          <section
            key={doc.id}
            role="tabpanel"
            id={`panel-${doc.id}`}
            aria-labelledby={`tab-${doc.id}`}
            className="editor-panel"
            data-mode={doc.mode}
            hidden={!active}
          >
            <ExternalChangeBanner doc={doc} />
            <div className="editor-surface">
              <EditorHost
                docId={doc.id}
                mode={doc.mode}
                initialMarkdown={doc.content}
                revision={doc.revision}
                documentPath={doc.path}
                options={options}
                active={active}
                onChange={onChange}
                onCursorChange={onCursorChange}
                onAdapter={onAdapter}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
