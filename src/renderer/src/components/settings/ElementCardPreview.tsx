import { useCallback, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import type { ElementStyle } from '@shared/theme-model';
import { ELEMENT_PREVIEW_CSS, elementPreviewScope, type ResolvedTheme } from '@renderer/themes';

/**
 * Layout of the miniature inside the shadow root: a document rendered at about half size
 * and clipped to the card. It never reacts to the pointer (the card is the button).
 */
const MINIATURE_CSS = `
:host { display: block; overflow: hidden; }
.element-card-scope { zoom: 0.46; pointer-events: none; user-select: none; }
.element-card-scope > .mpp-document { padding: 14px 20px; }
`;

/** A miniature document with the elements that tell element styles apart. */
function MiniDocument(): JSX.Element {
  return (
    <article className="mpp-document mpp-export">
      <h2>Heading</h2>
      <blockquote>
        <p>
          Simplicity is prerequisite
          <br />
          for reliability.
        </p>
      </blockquote>
      <div className="mpp-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Element</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Quotes</td>
              <td>Done</td>
            </tr>
            <tr>
              <td>Tables</td>
              <td>Review</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li>First point</li>
        <li>Second point</li>
      </ul>
      <figure className="mpp-code-block" data-language="ts">
        <figcaption className="mpp-code-lang">ts</figcaption>
        <pre>
          <code>
            <span className="tok-keyword">const</span>{' '}
            <span className="tok-variableName tok-definition">x</span> <span className="tok-operator">=</span>{' '}
            <span className="tok-number">42</span>
            <span className="tok-punctuation">;</span>
          </code>
        </pre>
      </figure>
    </article>
  );
}

/**
 * The art of an element style card: a scaled-down sample document rendered with
 * exactly that style (its fonts, headings, quotes, code frame, bullets and table
 * variant) in the colours of the active theme. The sample lives in a shadow root,
 * so the variant selectors see only this card's scope and never the document root,
 * which carries the active style. Hidden from assistive technology: the card's
 * button has the style's name as its label.
 */
export function ElementCardPreview({
  style,
  theme,
}: {
  readonly style: ElementStyle;
  readonly theme: ResolvedTheme;
}): JSX.Element {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const host = useCallback((element: HTMLSpanElement | null) => {
    if (element !== null) setShadow(element.shadowRoot ?? element.attachShadow({ mode: 'open' }));
  }, []);
  const scope = elementPreviewScope(theme, style);

  return (
    <span className="element-card-art" aria-hidden="true" data-element-style={style.id} ref={host}>
      {shadow !== null &&
        createPortal(
          <>
            <style>{`${ELEMENT_PREVIEW_CSS}\n${MINIATURE_CSS}`}</style>
            <div className="element-card-scope" {...scope.attributes} style={scope.variables}>
              <MiniDocument />
            </div>
          </>,
          shadow,
        )}
    </span>
  );
}
