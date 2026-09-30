import { languages } from '@codemirror/language-data';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import { editorViewCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
import { redo as historyRedo, undo as historyUndo } from '@milkdown/kit/prose/history';
import { Plugin, PluginKey, Selection } from '@milkdown/kit/prose/state';
import type { EditorView, NodeViewConstructor } from '@milkdown/kit/prose/view';
import { $prose, replaceAll } from '@milkdown/kit/utils';
import 'katex/dist/katex.min.css';
import { resolveImageSrc } from '@shared/file-url';
import { mppCodeMirrorTheme } from '@renderer/themes/codemirror';
import { splitFrontMatter } from '../markdown-utils';
import { SearchListeners } from '../search-listeners';
import type { EditorAdapter, EditorFactory, EditorOptions, SearchController } from '../types';
import { runWysiwygCommand, scrollToTopLevelHeading, wysiwygCursorInfo } from './commands';
import { createFrontMatterPanel } from './front-matter';
import { readImageFileAsDataUrl } from './image-upload';
import { boundedInlineMath, WYSIWYG_KATEX_OPTIONS } from './inline-math';
import { createListItemSelectionGuard } from './list-item-selection';
import { configureImageBlockAlt, configureMarkdownStyle, remarkNormalizeImages } from './markdown-fidelity';
import { createPlaceholderPlugin } from './placeholder';
import { createProseMirrorSearchController, createSearchPlugin } from './search';

type MutableOptions = { -readonly [K in keyof EditorOptions]: EditorOptions[K] };

const bridgeKey = new PluginKey('mpp-wysiwyg-bridge');

/** Views of live adapters, for integration tests and diagnostics ({@link wysiwygViewOf}). */
const liveViews = new WeakMap<EditorAdapter, () => EditorView | null>();

/**
 * Returns the ProseMirror view behind a WYSIWYG adapter (null before it is
 * ready, after it was destroyed, or for other adapters). Intended for tests and
 * diagnostics; application code must use the {@link EditorAdapter} contract.
 */
export function wysiwygViewOf(adapter: EditorAdapter): EditorView | null {
  return liveViews.get(adapter)?.() ?? null;
}

/** Shown instead of images whose source is not allowed (e.g. remote images while they are disabled). */
export const BLOCKED_IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">' +
    '<rect width="320" height="120" rx="12" fill="#8883"/>' +
    '<text x="160" y="66" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#888">' +
    'Image blocked</text></svg>',
)}`;
const IMAGE_NODE_VIEWS: ReadonlySet<string> = new Set(['image', 'image-block']);

/**
 * Joins verbatim front matter and the markdown serialised by the editor,
 * making sure the body starts on its own line.
 */
export function joinFrontMatter(frontMatter: string, body: string): string {
  if (frontMatter === '' || body === '') return frontMatter + body;
  return /[\r\n]$/.test(frontMatter) ? frontMatter + body : `${frontMatter}\n${body}`;
}

/** Attributes of the editable element; `spellcheck` follows the settings. */
function viewAttributes(options: MutableOptions): Record<string, string> {
  return {
    spellcheck: String(options.spellcheck),
    'aria-label': 'Document editor',
    'aria-multiline': 'true',
  };
}

/**
 * Creates the WYSIWYG editor (Milkdown Crepe) inside `host`.
 *
 * - `onChange` fires only for real document changes after the editor is ready
 *   and only when the serialised markdown actually differs, so opening a file
 *   never marks it dirty.
 * - Image `src` values are resolved through {@link resolveImageSrc}; rejected
 *   sources render as an empty image. Changing `documentPath` or
 *   `loadRemoteImages` re-renders all node views so existing images update.
 * - Crepe's frame theme is not imported: the theme engine maps Crepe's CSS
 *   variables to MarkDown++ tokens.
 * - YAML front matter is split off before the markdown reaches Milkdown (which
 *   has no front matter node), shown read-only above the document and
 *   prepended verbatim to every serialisation.
 * - Block and inline math use the same bounded KaTeX options
 *   ({@link WYSIWYG_KATEX_OPTIONS}).
 */
export const createWysiwygEditor: EditorFactory = (host, options, callbacks) => {
  const current: MutableOptions = { ...options };
  let destroyed = false;
  let view: EditorView | null = null;
  /** Markdown returned while the editor is not mounted, and the last value reported through `onChange`. */
  let markdown = options.initialMarkdown;
  /** Content set through `setMarkdown` before the editor was ready. */
  let pendingMarkdown: string | null = null;
  let suppressChanges = true;
  const initial = splitFrontMatter(options.initialMarkdown);
  /** Verbatim YAML front matter of the document ('' when it has none). */
  let frontMatter = initial.frontMatter;

  host.classList.add('mpp-document', 'mpp-wysiwyg');
  const frontMatterPanel = createFrontMatterPanel(host, frontMatter);
  const listItemGuard = createListItemSelectionGuard();
  const searchListeners = new SearchListeners();

  const crepe = new Crepe({
    root: host,
    defaultValue: initial.body,
    features: {
      [Crepe.Feature.CodeMirror]: true,
      [Crepe.Feature.ListItem]: true,
      [Crepe.Feature.LinkTooltip]: true,
      [Crepe.Feature.Cursor]: true,
      [Crepe.Feature.ImageBlock]: true,
      [Crepe.Feature.BlockEdit]: true,
      [Crepe.Feature.Toolbar]: true,
      // Replaced by our own plugin whose text can change at runtime (see ./placeholder).
      [Crepe.Feature.Placeholder]: false,
      [Crepe.Feature.Table]: true,
      [Crepe.Feature.Latex]: true,
      [Crepe.Feature.TopBar]: false,
      [Crepe.Feature.AI]: false,
    },
    featureConfigs: {
      [Crepe.Feature.CodeMirror]: {
        languages,
        theme: mppCodeMirrorTheme,
        searchPlaceholder: 'Search language',
      },
      [Crepe.Feature.ImageBlock]: {
        proxyDomURL: (src: string) =>
          resolveImageSrc(src, current.documentPath, current.loadRemoteImages) ?? BLOCKED_IMAGE_PLACEHOLDER,
        onUpload: readImageFileAsDataUrl,
      },
      [Crepe.Feature.LinkTooltip]: { inputPlaceholder: 'Paste or type a link…' },
      [Crepe.Feature.Latex]: { katexOptions: { ...WYSIWYG_KATEX_OPTIONS } },
    },
  });

  const serialize = (): string => joinFrontMatter(frontMatter, crepe.getMarkdown());

  const bridge = $prose(
    () =>
      new Plugin({
        key: bridgeKey,
        view: () => ({
          update(updatedView, previousState) {
            const docChanged = !updatedView.state.doc.eq(previousState.doc);
            if (docChanged && !suppressChanges) {
              const next = serialize();
              if (next !== markdown) {
                markdown = next;
                callbacks.onChange(next);
              }
            }
            if (docChanged || !updatedView.state.selection.eq(previousState.selection)) {
              callbacks.onCursorChange?.(wysiwygCursorInfo(updatedView.state));
            }
          },
        }),
        props: {
          handleDOMEvents: {
            focus: () => {
              callbacks.onFocus?.();
              return false;
            },
            blur: () => {
              callbacks.onBlur?.();
              return false;
            },
            // Links are edited, never followed, inside the editor.
            click: (_view, event) => {
              if (event.target instanceof Element && event.target.closest('a') !== null)
                event.preventDefault();
              return false;
            },
          },
        },
      }),
  );

  crepe.editor
    .config(configureMarkdownStyle)
    .config(configureImageBlockAlt)
    .config((ctx) => {
      ctx.update(editorViewOptionsCtx, (previous) => ({ ...previous, attributes: viewAttributes(current) }));
    })
    .use(remarkNormalizeImages)
    .use(boundedInlineMath)
    .use(listItemGuard.milkdownPlugin)
    .use($prose(() => listItemGuard.plugin))
    .use($prose(() => createSearchPlugin(searchListeners)))
    .use($prose(() => createPlaceholderPlugin(() => current.placeholder)))
    .use(bridge);

  const withView = <T>(fallback: T, action: (editorView: EditorView) => T): T =>
    view === null ? fallback : action(view);

  /** Replaces the document without reporting a change, keeping the caret near its position. */
  const replaceSilently = (editorView: EditorView, next: string): void => {
    const split = splitFrontMatter(next);
    frontMatter = split.frontMatter;
    frontMatterPanel.update(frontMatter);
    const caret = editorView.state.selection.from;
    suppressChanges = true;
    try {
      crepe.editor.action(replaceAll(split.body));
      const { doc } = editorView.state;
      const selection = Selection.near(doc.resolve(Math.min(caret, doc.content.size)));
      editorView.dispatch(editorView.state.tr.setSelection(selection));
      markdown = serialize();
    } finally {
      suppressChanges = false;
    }
  };

  // A failed creation rejects `ready`; the adapter then stays inert (every operation is a no-op).
  const ready = crepe.create().then(async (editor) => {
    if (destroyed) {
      await crepe.destroy();
      return;
    }
    const editorView = editor.ctx.get(editorViewCtx);
    view = editorView;
    // Baseline for change detection: the normalised form of the loaded document.
    markdown = serialize();
    suppressChanges = false;
    if (pendingMarkdown !== null) replaceSilently(editorView, pendingMarkdown);
    pendingMarkdown = null;
  });

  const search: SearchController = createProseMirrorSearchController(
    () => withView(null, (editorView) => editorView),
    searchListeners,
  );

  const refreshNodeViews = (editorView: EditorView): void => {
    // ProseMirror rebuilds node views whose constructor identity changed.
    const nodeViews = Object.fromEntries(
      Object.entries(editorView.props.nodeViews ?? {}).map(
        ([name, factory]): [string, NodeViewConstructor] => [
          name,
          IMAGE_NODE_VIEWS.has(name) ? (...args) => factory(...args) : factory,
        ],
      ),
    );
    editorView.setProps({ nodeViews });
  };

  const adapter: EditorAdapter = {
    mode: 'wysiwyg',
    ready,
    getMarkdown: () => withView(markdown, () => serialize()),
    setMarkdown(next) {
      if (destroyed) return;
      markdown = next;
      if (view === null) pendingMarkdown = next;
      else replaceSilently(view, next);
    },
    focus: () => withView(undefined, (editorView) => editorView.focus()),
    runCommand: (command) =>
      withView(false, (editorView) => {
        const result = crepe.editor.action((ctx) => runWysiwygCommand(ctx, command));
        editorView.focus();
        return result;
      }),
    undo: () => withView(false, (editorView) => historyUndo(editorView.state, editorView.dispatch)),
    redo: () => withView(false, (editorView) => historyRedo(editorView.state, editorView.dispatch)),
    scrollToHeading: (index) =>
      withView(undefined, (editorView) => void scrollToTopLevelHeading(editorView, index)),
    updateOptions(patch) {
      const imagesChanged =
        (patch.documentPath !== undefined && patch.documentPath !== current.documentPath) ||
        (patch.loadRemoteImages !== undefined && patch.loadRemoteImages !== current.loadRemoteImages);
      const placeholderChanged = patch.placeholder !== undefined && patch.placeholder !== current.placeholder;
      Object.assign(current, patch);
      withView(undefined, (editorView) => {
        editorView.setProps({ attributes: viewAttributes(current) });
        if (imagesChanged) refreshNodeViews(editorView);
        // Re-render decorations so a new placeholder text shows immediately.
        if (placeholderChanged) editorView.dispatch(editorView.state.tr);
      });
    },
    search,
    destroy() {
      if (destroyed) return;
      search.clear();
      destroyed = true;
      const wasMounted = view !== null;
      view = null;
      frontMatterPanel.destroy();
      host.classList.remove('mpp-document', 'mpp-wysiwyg');
      // Before `ready` settles, the create handler performs the teardown.
      if (wasMounted) void crepe.destroy();
    },
  };
  liveViews.set(adapter, () => view);
  return adapter;
};
