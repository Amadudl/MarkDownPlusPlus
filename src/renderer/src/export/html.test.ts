import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeStyleContent, serializeAttributes } from './html';

describe('escapeHtml', () => {
  it('escapes all markup-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});

describe('serializeAttributes', () => {
  it('serialises sorted, escaped attributes', () => {
    expect(serializeAttributes({ 'data-b': 'x"y', lang: 'en', 'data-a': '<1>' })).toBe(
      ' data-a="&lt;1&gt;" data-b="x&quot;y" lang="en"',
    );
  });

  it('skips invalid names and event handlers', () => {
    expect(serializeAttributes({ onload: 'alert(1)', 'x y': '1', 'a"b': '1', Upper: '1', ok: '1' })).toBe(
      ' ok="1"',
    );
    expect(serializeAttributes({})).toBe('');
  });
});

describe('escapeStyleContent', () => {
  it('neutralises closing style tags in any case', () => {
    expect(escapeStyleContent('a{} </style><script>x</script> </STYLE >')).toBe(
      'a{} <\\/style><script>x</script> <\\/STYLE >',
    );
    expect(escapeStyleContent('a{color:red}')).toBe('a{color:red}');
  });
});
