import { LanguageDescription } from '@codemirror/language';
import type { LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

/** A Lezer parser of a CodeMirror language. */
export type CodeParser = LanguageSupport['language']['parser'];

/** Resolves a fenced code block info-string language to a parser, or null when unknown. */
export type ParserResolver = (language: string) => Promise<CodeParser | null>;

/** Info strings longer than this, or with other characters, are not treated as a language. */
const LANGUAGE_NAME = /^[\w#+.-]{1,40}$/;

/** Returns the normalised language name of an info string, or null when it is not a plausible name. */
export function normalizeLanguageName(raw: string): string | null {
  const name = raw.trim();
  return LANGUAGE_NAME.test(name) ? name : null;
}

/**
 * Creates a resolver backed by `descriptions` (defaults to every language of
 * `@codemirror/language-data`). Each language is loaded at most once; failed loads
 * resolve to null so the code block is rendered as plain text.
 */
export function createParserResolver(
  descriptions: readonly LanguageDescription[] = languages,
): ParserResolver {
  const cache = new Map<LanguageDescription, Promise<CodeParser | null>>();
  return (language: string) => {
    const name = normalizeLanguageName(language);
    if (name === null) return Promise.resolve(null);
    const description = LanguageDescription.matchLanguageName(descriptions, name, true);
    if (description === null) return Promise.resolve(null);
    let pending = cache.get(description);
    if (pending === undefined) {
      pending = description.load().then(
        (support) => support.language.parser,
        () => null,
      );
      cache.set(description, pending);
    }
    return pending;
  };
}

/** Shared resolver used by the export pipeline (languages are cached for the app lifetime). */
export const defaultParserResolver: ParserResolver = createParserResolver();
