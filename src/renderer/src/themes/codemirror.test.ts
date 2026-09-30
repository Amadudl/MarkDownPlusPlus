import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { highlightTree, tags as t } from '@lezer/highlight';
import { afterEach, describe, expect, it } from 'vitest';
import { mppCodeMirrorTheme, mppHighlightStyle } from './codemirror';

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

/** Every `<style>` text currently mounted in the document (style-mod uses style elements in jsdom). */
function mountedCss(): string {
  return [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n');
}

describe('mppCodeMirrorTheme', () => {
  it('is a non-empty extension that mounts in an editor', () => {
    expect(Array.isArray(mppCodeMirrorTheme) && mppCodeMirrorTheme.length).toBe(2);
    const parent = document.createElement('div');
    document.body.append(parent);
    view = new EditorView({
      state: EditorState.create({
        doc: '# Title\n\nSome *text*',
        extensions: [mppCodeMirrorTheme, markdown()],
      }),
      parent,
    });
    expect(view.dom.classList.contains('cm-editor')).toBe(true);
    // The theme adds its own generated scope class to the editor.
    expect([...view.dom.classList].some((name) => name.startsWith('ͼ'))).toBe(true);
  });

  it('only uses CSS variables for colours', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    view = new EditorView({ state: EditorState.create({ extensions: [mppCodeMirrorTheme] }), parent });
    const cssText = mountedCss();
    expect(cssText).toContain('var(--mpp-code-background)');
    expect(cssText).toContain('var(--mpp-code-gutter-foreground)');
    expect(cssText).toContain('var(--mpp-ui-mark)');
    expect(cssText).toContain('var(--mpp-source-font-family, var(--mpp-el-mono-font))');
  });
});

describe('mppHighlightStyle', () => {
  const rules = mppHighlightStyle.module?.getRules() ?? '';

  it('styles syntax tokens exclusively through --mpp-code-* variables', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).toContain('var(--mpp-code-comment-style)');
    expect(rules).toContain('var(--mpp-code-keyword-weight)');
  });

  it.each([
    [t.comment, 'comment'],
    [t.lineComment, 'comment'],
    [t.keyword, 'keyword'],
    [t.controlKeyword, 'control-keyword'],
    [t.operator, 'operator'],
    [t.punctuation, 'punctuation'],
    [t.string, 'string'],
    [t.number, 'number'],
    [t.bool, 'boolean'],
    [t.null, 'constant'],
    [t.variableName, 'variable'],
    [t.propertyName, 'property'],
    [t.function(t.variableName), 'function'],
    [t.typeName, 'type'],
    [t.className, 'class-name'],
    [t.tagName, 'tag'],
    [t.attributeName, 'attribute'],
    [t.regexp, 'regexp'],
    [t.escape, 'escape'],
    [t.meta, 'meta'],
    [t.invalid, 'invalid'],
    [t.heading, 'heading'],
    [t.heading2, 'heading'],
    [t.emphasis, 'emphasis'],
    [t.strong, 'strong'],
    [t.link, 'link'],
    [t.url, 'link'],
    [t.quote, 'quote'],
    [t.monospace, 'string'],
    [t.processingInstruction, 'meta'],
  ])('maps %s to --mpp-code-%s', (tag, variable) => {
    const className = mppHighlightStyle.style([tag]);
    expect(className).toBeTruthy();
    const rule = rules.split('\n').find((line) => line.includes(`.${className!.split(' ')[0]!}`)) ?? '';
    expect(rule).toContain(`var(--mpp-code-${variable})`);
  });

  it('does not colour list item text, only the list markers', () => {
    expect(mppHighlightStyle.style([t.list])).toBeNull();
    const source = '- first item\n- second *item*\n\n1. ordered';
    const tree = markdown().language.parser.parse(source);
    const styled: { text: string; cls: string }[] = [];
    highlightTree(tree, mppHighlightStyle, (from, to, cls) =>
      styled.push({ text: source.slice(from, to), cls }),
    );
    const texts = styled.map((range) => range.text);
    expect(texts).toEqual(expect.arrayContaining(['-', '1.', 'item']));
    expect(texts.some((text) => text.includes('first'))).toBe(false);
    expect(texts.some((text) => text.includes('ordered'))).toBe(false);
    const marker = styled.find((range) => range.text === '-');
    expect(marker?.cls).toBe(mppHighlightStyle.style([t.processingInstruction]));
  });

  it('highlights real markdown source', () => {
    const tree = markdown().language.parser.parse('# Title\n\n**bold** and [link](https://x.dev) `code`');
    const classes = new Set<string>();
    highlightTree(tree, mppHighlightStyle, (_from, _to, cls) => classes.add(cls));
    expect(classes.size).toBeGreaterThanOrEqual(4);
  });
});
