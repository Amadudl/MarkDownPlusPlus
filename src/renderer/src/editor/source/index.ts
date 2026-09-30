import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import { mppCodeMirrorTheme } from '@renderer/themes/codemirror';
import type { CursorInfo, EditorAdapter, EditorFactory, EditorOptions } from '../types';
import { extractHeadings } from '../markdown-utils';
import { applyFormatCommand } from './formatting';
import { withoutReservedKeys } from './keymap';
import { SearchListeners } from '../search-listeners';
import { createCodeMirrorSearchController, sourceSearchExtension } from './search';

type SourceOptions = Omit<EditorOptions, 'initialMarkdown' | 'documentPath'>;

const lineNumbersExtension = (enabled: boolean): Extension =>
  enabled ? [lineNumbers(), highlightActiveLineGutter()] : [];
const wrapExtension = (enabled: boolean): Extension => (enabled ? EditorView.lineWrapping : []);
const indentExtension = (tabSize: number): Extension => {
  const size = Math.min(8, Math.max(1, Math.round(tabSize)));
  return [indentUnit.of(' '.repeat(size)), EditorState.tabSize.of(size)];
};
const spellcheckExtension = (enabled: boolean): Extension =>
  EditorView.contentAttributes.of({
    spellcheck: String(enabled),
    autocorrect: enabled ? 'on' : 'off',
    autocapitalize: 'off',
    'aria-label': 'Markdown source editor',
  });
const placeholderExtension = (text: string): Extension => (text === '' ? [] : placeholder(text));

/** 1-based line/column of the main selection head plus the selection length. */
export function sourceCursorInfo(state: EditorState): CursorInfo {
  const { main } = state.selection;
  const line = state.doc.lineAt(main.head);
  return { line: line.number, column: main.head - line.from + 1, selectionLength: main.to - main.from };
}

/**
 * Creates the source editor (CodeMirror 6, GFM markdown with nested code
 * language highlighting) inside `host`. `onChange` fires for user edits only;
 * {@link EditorAdapter.setMarkdown} replaces the content silently.
 */
export const createSourceEditor: EditorFactory = (host, options, callbacks) => {
  const compartments = {
    lineNumbers: new Compartment(),
    wrap: new Compartment(),
    indent: new Compartment(),
    spellcheck: new Compartment(),
    placeholder: new Compartment(),
  };
  const current: { -readonly [K in keyof SourceOptions]: SourceOptions[K] } = {
    spellcheck: options.spellcheck,
    tabSize: options.tabSize,
    wordWrap: options.wordWrap,
    lineNumbers: options.lineNumbers,
    loadRemoteImages: options.loadRemoteImages,
    placeholder: options.placeholder,
  };
  let silent = false;
  let destroyed = false;
  const searchListeners = new SearchListeners();

  const extensions: Extension[] = [
    compartments.lineNumbers.of(lineNumbersExtension(options.lineNumbers)),
    compartments.wrap.of(wrapExtension(options.wordWrap)),
    compartments.indent.of(indentExtension(options.tabSize)),
    compartments.spellcheck.of(spellcheckExtension(options.spellcheck)),
    compartments.placeholder.of(placeholderExtension(options.placeholder)),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    sourceSearchExtension(searchListeners),
    keymap.of(
      withoutReservedKeys([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    ),
    mppCodeMirrorTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !silent) callbacks.onChange(update.state.doc.toString());
      if (update.docChanged || update.selectionSet)
        callbacks.onCursorChange?.(sourceCursorInfo(update.state));
      if (update.focusChanged) {
        if (update.view.hasFocus) callbacks.onFocus?.();
        else callbacks.onBlur?.();
      }
    }),
  ];

  host.classList.add('mpp-source');
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: options.initialMarkdown, extensions }),
  });

  const search = createCodeMirrorSearchController(() => (destroyed ? null : view), searchListeners);
  const alive = <T>(fallback: T, action: () => T): T => (destroyed ? fallback : action());

  const adapter: EditorAdapter = {
    mode: 'source',
    ready: Promise.resolve(),
    getMarkdown: () => view.state.doc.toString(),
    setMarkdown(markdownText) {
      alive(undefined, () => {
        if (markdownText === view.state.doc.toString()) return;
        silent = true;
        try {
          const head = Math.min(view.state.selection.main.head, markdownText.length);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdownText },
            selection: { anchor: head },
          });
        } finally {
          silent = false;
        }
      });
    },
    focus: () => alive(undefined, () => view.focus()),
    runCommand: (command) =>
      alive(false, () => {
        const { main } = view.state.selection;
        const edit = applyFormatCommand(view.state.doc.toString(), { from: main.from, to: main.to }, command);
        view.dispatch({
          changes: { from: edit.from, to: edit.to, insert: edit.insert },
          selection: { anchor: edit.selection.from, head: edit.selection.to },
          scrollIntoView: true,
          userEvent: 'input.format',
        });
        view.focus();
        return true;
      }),
    undo: () => alive(false, () => undo(view)),
    redo: () => alive(false, () => redo(view)),
    scrollToHeading: (index) =>
      alive(undefined, () => {
        const heading = extractHeadings(view.state.doc.toString())[index];
        if (heading === undefined || heading.line > view.state.doc.lines) return;
        const line = view.state.doc.line(heading.line);
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 24 }),
        });
        view.focus();
      }),
    updateOptions(patch) {
      alive(undefined, () => {
        const effects = [];
        if (patch.lineNumbers !== undefined && patch.lineNumbers !== current.lineNumbers) {
          effects.push(compartments.lineNumbers.reconfigure(lineNumbersExtension(patch.lineNumbers)));
        }
        if (patch.wordWrap !== undefined && patch.wordWrap !== current.wordWrap) {
          effects.push(compartments.wrap.reconfigure(wrapExtension(patch.wordWrap)));
        }
        if (patch.tabSize !== undefined && patch.tabSize !== current.tabSize) {
          effects.push(compartments.indent.reconfigure(indentExtension(patch.tabSize)));
        }
        if (patch.spellcheck !== undefined && patch.spellcheck !== current.spellcheck) {
          effects.push(compartments.spellcheck.reconfigure(spellcheckExtension(patch.spellcheck)));
        }
        if (patch.placeholder !== undefined && patch.placeholder !== current.placeholder) {
          effects.push(compartments.placeholder.reconfigure(placeholderExtension(patch.placeholder)));
        }
        Object.assign(current, patch);
        if (effects.length > 0) view.dispatch({ effects });
      });
    },
    search,
    destroy() {
      if (destroyed) return;
      search.clear();
      destroyed = true;
      view.destroy();
      host.classList.remove('mpp-source');
    },
  };
  return adapter;
};
