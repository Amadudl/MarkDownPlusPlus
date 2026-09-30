import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { elementStyleSchema } from '@shared/theme-model';
import { resolveTheme, themeToCssVariables } from './engine';
import { readRepoFile, readThemeCss } from './testing/raw-css';

const STYLESHEETS = ['tokens.css', 'crepe-bridge.css', 'elements.css', 'tokens-classes.css', 'export.css'];
const css = Object.fromEntries(STYLESHEETS.map((name) => [name, readThemeCss(name)]));
const themeVars = themeToCssVariables(resolveTheme(DEFAULT_SETTINGS, true));

/** Custom properties declared (`--name:`) in a stylesheet. */
function declared(text: string): Set<string> {
  return new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]!));
}

/** Custom properties referenced through `var(--name…)`. */
function referenced(text: string, prefix: string): Set<string> {
  return new Set([...text.matchAll(new RegExp(`var\\((${prefix}[a-z0-9-]*)`, 'g'))].map((m) => m[1]!));
}

describe('theme stylesheets', () => {
  it('keep the default tokens in sync with the default theme (Midnight / Tokyo Night / Modern)', () => {
    const tokens = css['tokens.css']!;
    // Prettier may wrap long values; compare with collapsed whitespace.
    const defaults = tokens.slice(tokens.indexOf('/* Default theme')).replace(/\s+/g, ' ');
    for (const [name, value] of Object.entries(themeVars)) {
      expect(defaults).toContain(` ${name}: ${value};`);
    }
    expect(declared(defaults).size).toBe(Object.keys(themeVars).length);
    expect(defaults).toContain('color-scheme: dark;');
  });

  it('only reference variables that are defined', () => {
    const known = new Set([
      ...Object.keys(themeVars),
      ...declared(css['tokens.css']!),
      ...declared(css['crepe-bridge.css']!),
      // Set by the source editor host (EditorArea) for the CodeMirror source view.
      '--mpp-source-font-family',
      '--mpp-source-font-size',
    ]);
    const codemirror = readRepoFile('src/renderer/src/themes/codemirror.ts');
    const fromHelper = [...codemirror.matchAll(/code\('([a-z-]+)'\)/g)].map(
      (match) => `--mpp-code-${match[1]!}`,
    );
    expect(fromHelper.length).toBeGreaterThan(30);
    const direct = [...Object.values(css), codemirror].flatMap((text) => [...referenced(text, '--mpp-')]);
    // `var(--mpp-code-${name})` inside the helper itself is a template, not a reference.
    const names = [...direct.filter((name) => !name.endsWith('-')), ...fromHelper];
    expect(names.filter((name) => !known.has(name))).toEqual([]);
  });

  it('never contain "<", so they are safe inside a <style> element', () => {
    for (const text of Object.values(css)) expect(text).not.toContain('<');
  });

  it('have balanced braces and parentheses', () => {
    for (const [name, text] of Object.entries(css)) {
      const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
      const count = (char: string): number => withoutComments.split(char).length - 1;
      expect(count('{'), name).toBe(count('}'));
      expect(count('('), name).toBe(count(')'));
    }
  });

  it('never put a relative selector inside :is(), which would invalidate the whole rule', () => {
    for (const text of Object.values(css)) expect(text).not.toMatch(/:is\([^)]*,\s*>/);
  });

  it('style every non-default element style variant', () => {
    const elements = css['elements.css']!;
    const shape = elementStyleSchema.shape;
    const variants: [string, readonly string[], readonly string[]][] = [
      ['data-mpp-quote', shape.blockquote.shape.variant.options, ['bar']],
      ['data-mpp-codeblock', shape.codeBlock.shape.variant.options, ['flat']],
      ['data-mpp-inline-code', shape.inlineCode.shape.variant.options, ['pill']],
      ['data-mpp-table', shape.table.shape.variant.options, []],
      ['data-mpp-bullet', shape.list.shape.bullet.options, []],
      ['data-mpp-link', shape.link.shape.variant.options, ['underline']],
      ['data-mpp-hr', shape.horizontalRule.shape.variant.options, ['line']],
      ['data-mpp-heading-underline', shape.headings.shape.underline.options, ['none']],
    ];
    for (const [attribute, options, defaults] of variants) {
      for (const option of options.filter((value) => !defaults.includes(value))) {
        expect(elements, `${attribute}=${option}`).toContain(`[${attribute}='${option}']`);
      }
    }
    for (const flag of [
      'data-mpp-quote-italic',
      'data-mpp-code-line-numbers',
      'data-mpp-code-show-language',
      'data-mpp-table-compact',
      'data-mpp-uppercase-small',
      'data-mpp-image-centered',
      'data-mpp-image-shadow',
    ]) {
      expect(elements, flag).toMatch(new RegExp(`\\[${flag}='(true|false)'\\]`));
    }
  });

  it('bridge every colour, font and shadow variable of the Crepe frame theme', () => {
    const frame = readRepoFile('node_modules/@milkdown/crepe/lib/theme/frame/style.css');
    const bridge = declared(css['crepe-bridge.css']!);
    const crepeVars = [...declared(frame)].filter((name) => name.startsWith('--crepe-'));
    expect(crepeVars.length).toBeGreaterThan(20);
    expect(crepeVars.filter((name) => !bridge.has(name))).toEqual([]);
  });

  it('style the tok-* classes emitted by the export highlighter', () => {
    const tokens = css['tokens-classes.css']!;
    for (const name of [
      'comment',
      'keyword',
      'string',
      'string2',
      'number',
      'bool',
      'atom',
      'variableName',
      'variableName2',
      'propertyName',
      'typeName',
      'namespace',
      'className',
      'macroName',
      'labelName',
      'operator',
      'punctuation',
      'meta',
      'invalid',
      'inserted',
      'deleted',
      'literal',
      'heading',
      'emphasis',
      'strong',
      'strikethrough',
      'link',
      'url',
      'function',
      'local',
      'special',
      'definition',
      'tagName',
      'attributeName',
    ]) {
      expect(tokens, name).toContain(`.tok-${name}`);
    }
  });

  it('never colour whole Markdown lists (lezer puts .tok-list on every list item)', () => {
    const withoutComments = css['tokens-classes.css']!.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toContain('.tok-list');
  });

  it('frame striped tables with a real border that cell backgrounds cannot cover', () => {
    const elements = css['elements.css']!.replace(/\s+/g, ' ');
    const striped = /\[data-mpp-table='striped'\] :is\([^{]*\) table \{([^}]*)\}/.exec(elements)?.[1] ?? '';
    expect(striped).toContain('border: 1px solid var(--mpp-ui-table-border);');
    expect(striped).toContain('border-collapse: separate;');
    expect(striped).toContain('border-spacing: 0;');
    expect(striped).toContain('overflow: hidden;');
    expect(striped).not.toContain('box-shadow');
  });

  it('stripe the same body rows in the editor (header row inside <tbody>) and in exported HTML', () => {
    const elements = css['elements.css']!.replace(/\s+/g, ' ');
    for (const variant of ['grid', 'striped']) {
      const rule = new RegExp(
        `\\[data-mpp-table='${variant}'\\] ([^{}]*)\\{ background: var\\(--mpp-ui-table-stripe\\); \\}`,
      ).exec(elements)?.[1];
      const selectors = (rule ?? '').split(',').map((part) => part.trim());
      expect(selectors, variant).toEqual([
        '.mpp-document:not(:has(> .milkdown)) tbody tr:nth-child(even) td',
        `[data-mpp-table='${variant}'] .mpp-document .milkdown .ProseMirror tr:not([data-is-header]):nth-child(odd) td`,
      ]);
    }
  });
});
