import './front-matter.css';

/** Class of the read-only front matter panel shown above the Visual mode document. */
export const FRONT_MATTER_CLASS = 'mpp-front-matter';

/** The read-only front matter panel of one WYSIWYG editor. */
export interface FrontMatterPanel {
  /** Shows `frontMatter` (hides the panel when it is empty). */
  update(frontMatter: string): void;
  /** Removes the panel from the document. */
  destroy(): void;
}

/** The front matter without its fence lines and trailing blank lines, as shown in the panel. */
export function frontMatterBody(frontMatter: string): string {
  const lines = frontMatter.replace(/(?:\r\n|\r|\n)[ \t\r\n]*$/, '').split(/\r\n|\r|\n/);
  return lines.slice(1, -1).join('\n');
}

/**
 * Creates the front matter panel as the first child of `host`. YAML front
 * matter is not part of the Visual mode document (Milkdown has no front matter
 * node and would turn it into a rule plus a heading); the WYSIWYG adapter
 * keeps it verbatim and this panel shows it read-only, pointing to Markdown
 * mode for editing.
 */
export function createFrontMatterPanel(host: HTMLElement, frontMatter: string): FrontMatterPanel {
  const panel = document.createElement('section');
  panel.className = FRONT_MATTER_CLASS;
  panel.contentEditable = 'false';
  panel.setAttribute('aria-label', 'Front matter (read-only)');

  const header = document.createElement('div');
  header.className = `${FRONT_MATTER_CLASS}-header`;
  const title = document.createElement('span');
  title.className = `${FRONT_MATTER_CLASS}-title`;
  title.textContent = 'Front matter';
  const hint = document.createElement('span');
  hint.className = `${FRONT_MATTER_CLASS}-hint`;
  hint.textContent = 'Read-only here · edit it in Markdown mode';
  header.append(title, hint);

  const code = document.createElement('code');
  const pre = document.createElement('pre');
  pre.className = `${FRONT_MATTER_CLASS}-code`;
  pre.append(code);
  panel.append(header, pre);
  host.prepend(panel);

  const update = (next: string): void => {
    panel.hidden = next === '';
    code.textContent = frontMatterBody(next);
  };
  update(frontMatter);

  return {
    update,
    destroy: () => panel.remove(),
  };
}
