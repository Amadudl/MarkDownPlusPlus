import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { BUILTIN_ELEMENT_STYLES, ELEMENT_PREVIEW_CSS, resolveTheme } from '@renderer/themes';
import { resetApp } from '@renderer/test/utils';
import { ElementCardPreview } from './ElementCardPreview';

const theme = resolveTheme(DEFAULT_SETTINGS, true);
const style = (id: string): (typeof BUILTIN_ELEMENT_STYLES)[number] => {
  const found = BUILTIN_ELEMENT_STYLES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing preset ${id}`);
  return found;
};

/** The shadow root of the rendered card art. */
function shadowOf(container: HTMLElement): ShadowRoot {
  const shadow = container.querySelector('.element-card-art')?.shadowRoot;
  if (shadow === null || shadow === undefined) throw new Error('no shadow root');
  return shadow;
}

describe('ElementCardPreview', () => {
  beforeEach(() => {
    resetApp();
  });

  it('renders a sample document of the style in an isolated, hidden shadow root', () => {
    const technical = style('technical');
    const { container } = render(<ElementCardPreview style={technical} theme={theme} />);
    const host = container.querySelector('.element-card-art');
    expect(host).toHaveAttribute('aria-hidden', 'true');
    expect(host).toHaveAttribute('data-element-style', 'technical');
    // Nothing leaks into the light DOM (and therefore into the card button's text).
    expect(host?.childNodes).toHaveLength(0);
    const shadow = shadowOf(container);
    expect(shadow.querySelector('style')?.textContent).toContain(ELEMENT_PREVIEW_CSS);
    const scope = shadow.querySelector<HTMLElement>('.element-card-scope');
    expect(scope).toHaveAttribute('data-mpp-table', 'grid');
    expect(scope).toHaveAttribute('data-mpp-codeblock', 'window');
    expect(scope).toHaveAttribute('data-mpp-element-style', 'technical');
    expect(scope?.style.getPropertyValue('--mpp-el-h2-size')).toBe(
      `${String(technical.headings.scale[1])}em`,
    );
    const doc = shadow.querySelector('article.mpp-document');
    for (const selector of [
      'h2',
      'blockquote',
      'ul > li',
      'figure.mpp-code-block pre code',
      'table tbody tr',
    ]) {
      expect(doc?.querySelector(selector), selector).not.toBeNull();
    }
    expect(doc?.querySelectorAll('tr')).toHaveLength(3);
  });

  it('keeps its shadow root and updates the scope when the style changes', () => {
    const { container, rerender } = render(<ElementCardPreview style={style('modern')} theme={theme} />);
    const shadow = shadowOf(container);
    expect(shadow.querySelector('.element-card-scope')).toHaveAttribute('data-mpp-table', 'striped');
    rerender(<ElementCardPreview style={style('classic')} theme={theme} />);
    expect(shadowOf(container)).toBe(shadow);
    expect(shadow.querySelector('.element-card-scope')).toHaveAttribute('data-mpp-table', 'bordered');
  });
});
