import { classHighlighter, tags as t, type Tag } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { mppTokenHighlighter } from './token-highlighter';

const cls = (tag: Tag): string | null => mppTokenHighlighter.style([tag]);

describe('mppTokenHighlighter', () => {
  it('produces the same classes as classHighlighter for the common tags', () => {
    for (const tag of [
      t.comment,
      t.keyword,
      t.string,
      t.number,
      t.bool,
      t.atom,
      t.variableName,
      t.propertyName,
      t.typeName,
      t.className,
      t.operator,
      t.punctuation,
      t.meta,
      t.invalid,
      t.heading,
      t.link,
      t.url,
      t.regexp,
      t.definition(t.variableName),
      t.local(t.variableName),
    ]) {
      expect(cls(tag)).toBe(classHighlighter.style([tag]));
    }
  });

  it.each([
    [t.function(t.variableName), 'tok-variableName tok-function'],
    [t.function(t.definition(t.variableName)), 'tok-variableName tok-definition tok-function'],
    [t.function(t.propertyName), 'tok-propertyName tok-function'],
    [t.controlKeyword, 'tok-keyword tok-controlKeyword'],
    [t.constant(t.variableName), 'tok-variableName tok-constant'],
    [t.escape, 'tok-string2 tok-escape'],
    [t.tagName, 'tok-tagName'],
    [t.attributeName, 'tok-attributeName'],
    [t.attributeValue, 'tok-string'],
    [t.strikethrough, 'tok-strikethrough'],
    [t.quote, 'tok-quote'],
    [t.null, 'tok-atom'],
    [t.lineComment, 'tok-comment'],
    [t.processingInstruction, 'tok-meta'],
  ])('distinguishes %s', (tag, expected) => {
    expect(cls(tag)).toBe(expected);
  });
});
