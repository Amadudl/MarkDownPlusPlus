import { describe, expect, it } from 'vitest';
import { createFrontMatterPanel, FRONT_MATTER_CLASS, frontMatterBody } from './front-matter';

describe('frontMatterBody', () => {
  it('drops the fences and trailing blank lines', () => {
    expect(frontMatterBody('---\ntitle: x\ntags: [a]\n---\n\n\n')).toBe('title: x\ntags: [a]');
    expect(frontMatterBody('---\r\na: 1\r\n...')).toBe('a: 1');
    expect(frontMatterBody('---\n---\n')).toBe('');
  });
});

describe('createFrontMatterPanel', () => {
  it('prepends a read-only panel that follows updates and can be removed', () => {
    const host = document.createElement('div');
    host.append(document.createElement('main'));
    const panel = createFrontMatterPanel(host, '---\na: 1\n---\n');
    const element = host.firstElementChild as HTMLElement;
    expect(element.className).toBe(FRONT_MATTER_CLASS);
    expect(element.contentEditable).toBe('false');
    expect(element.getAttribute('aria-label')).toBe('Front matter (read-only)');
    expect(element.hidden).toBe(false);
    expect(element.querySelector('code')?.textContent).toBe('a: 1');
    expect(element.textContent).toContain('edit it in Markdown mode');
    panel.update('');
    expect(element.hidden).toBe(true);
    panel.update('---\nb: 2\n---');
    expect(element.hidden).toBe(false);
    expect(element.querySelector('code')?.textContent).toBe('b: 2');
    panel.destroy();
    expect(host.querySelector(`.${FRONT_MATTER_CLASS}`)).toBeNull();
  });
});
