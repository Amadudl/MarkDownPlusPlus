import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { describe, expect, it, vi } from 'vitest';
import { createParserResolver, defaultParserResolver, normalizeLanguageName } from './languages';

const plainLanguage = StreamLanguage.define({
  token(stream) {
    stream.next();
    return null;
  },
});

describe('normalizeLanguageName', () => {
  it('accepts plausible language names and trims them', () => {
    expect(normalizeLanguageName(' ts ')).toBe('ts');
    expect(normalizeLanguageName('c++')).toBe('c++');
    expect(normalizeLanguageName('objective-c')).toBe('objective-c');
  });

  it('rejects empty, overlong or unusual names', () => {
    expect(normalizeLanguageName('')).toBeNull();
    expect(normalizeLanguageName('a'.repeat(41))).toBeNull();
    expect(normalizeLanguageName('"><script>')).toBeNull();
  });
});

describe('createParserResolver', () => {
  it('loads each language once and caches the parser', async () => {
    const load = vi.fn(() => Promise.resolve(new LanguageSupport(plainLanguage)));
    const description = LanguageDescription.of({ name: 'Plain', alias: ['pl'], load });
    const resolve = createParserResolver([description]);
    const [first, second] = await Promise.all([resolve('plain'), resolve('pl')]);
    expect(first).toBe(plainLanguage.parser);
    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('resolves null for unknown, invalid and failing languages', async () => {
    const description = LanguageDescription.of({
      name: 'Broken',
      load: () => Promise.reject(new Error('boom')),
    });
    const resolve = createParserResolver([description]);
    await expect(resolve('nope')).resolves.toBeNull();
    await expect(resolve('<bad>')).resolves.toBeNull();
    await expect(resolve('broken')).resolves.toBeNull();
  });

  it('knows the languages of @codemirror/language-data by default', async () => {
    await expect(defaultParserResolver('python')).resolves.not.toBeNull();
    await expect(createParserResolver()('typescript')).resolves.not.toBeNull();
  });
});
