import type { JSX } from 'react';
/** A token of the preview snippet: text plus @lezer/highlight `classHighlighter` classes. */
type Token = readonly [text: string, className?: string];

const KW = 'tok-keyword';
const DEF = 'tok-variableName tok-definition';
const VAR = 'tok-variableName';
const TYPE = 'tok-typeName';
const PROP = 'tok-propertyName';
const STR = 'tok-string';
const NUM = 'tok-number';
const PUN = 'tok-punctuation';
const OP = 'tok-operator';

/** A short TypeScript snippet that exercises the most common token types. */
export const CODE_SAMPLE: readonly (readonly Token[])[] = [
  [['// Greet the first few users', 'tok-comment']],
  [
    ['import', KW],
    [' { '],
    ['type', KW],
    [' '],
    ['User', TYPE],
    [' } '],
    ['from', KW],
    [' '],
    ["'./users'", STR],
    [';', PUN],
  ],
  [['const', KW], [' '], ['LIMIT', DEF], [' '], ['=', OP], [' '], ['3', NUM], [';', PUN]],
  [
    ['export', KW],
    [' '],
    ['async', KW],
    [' '],
    ['function', KW],
    [' '],
    ['greet', DEF],
    ['('],
    ['users', DEF],
    [': '],
    ['User', TYPE],
    ['[]'],
    ['): '],
    ['Promise', TYPE],
    ['<'],
    ['string', TYPE],
    ['> {'],
  ],
  [
    ['  '],
    ['for', KW],
    [' ('],
    ['const', KW],
    [' '],
    ['user', DEF],
    [' '],
    ['of', KW],
    [' '],
    ['users', VAR],
    ['.', PUN],
    ['slice', PROP],
    ['('],
    ['0', NUM],
    [', '],
    ['LIMIT', VAR],
    [')) {'],
  ],
  [
    ['    '],
    ['notify', VAR],
    ['('],
    ['`Hello, ${', STR],
    ['user', VAR],
    ['.', PUN],
    ['name', PROP],
    ['}!`', STR],
    [', '],
    ['true', 'tok-bool'],
    [');', PUN],
  ],
  [['  }']],
  [['  '], ['return', KW], [' '], ["'done'", STR], [';', PUN]],
  [['}']],
];

/** Renders {@link CODE_SAMPLE} as highlighted lines. */
export function CodeSample(): JSX.Element {
  return (
    <code>
      {CODE_SAMPLE.map((line, lineIndex) => (
        <span key={lineIndex} className="code-sample-line">
          {line.map(([text, className], tokenIndex) =>
            className === undefined ? (
              text
            ) : (
              <span key={tokenIndex} className={className}>
                {text}
              </span>
            ),
          )}
          {'\n'}
        </span>
      ))}
    </code>
  );
}

/**
 * A representative document using every element an element style controls, in
 * the same DOM shape as exported HTML (so the real element CSS applies).
 */
export function ElementSampleDocument(): JSX.Element {
  return (
    <article className="mpp-document mpp-export element-sample">
      <h1>Project notes</h1>
      <p>
        Markdown is <strong>simple</strong>, <em>expressive</em> and portable. Read the{' '}
        <a href="#guide" onClick={(event) => event.preventDefault()}>
          style guide
        </a>{' '}
        or run <code>npm run build</code> to get started.
      </p>
      <h2>Highlights</h2>
      <ul>
        <li>Visual editing with live formatting</li>
        <li>
          Nested lists
          <ul>
            <li>stay readable</li>
          </ul>
        </li>
      </ul>
      <ol>
        <li>Write</li>
        <li>Review</li>
      </ol>
      <ul className="contains-task-list">
        <li className="task-list-item">
          <input type="checkbox" disabled checked readOnly /> Draft the outline
        </li>
        <li className="task-list-item">
          <input type="checkbox" disabled readOnly /> Publish
        </li>
      </ul>
      <blockquote>
        <p>Simplicity is prerequisite for reliability.</p>
      </blockquote>
      <h3>Snippet</h3>
      <figure className="mpp-code-block" data-language="ts">
        <figcaption className="mpp-code-lang">ts</figcaption>
        <pre>
          <CodeSample />
        </pre>
      </figure>
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
              <td>Headings</td>
              <td>Done</td>
            </tr>
            <tr>
              <td>Tables</td>
              <td>In review</td>
            </tr>
            <tr>
              <td>Images</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>
      <hr />
      <h4>Small heading</h4>
      <p>
        The end of the sample, with <mark>highlighted</mark> and <del>removed</del> text.
      </p>
    </article>
  );
}
