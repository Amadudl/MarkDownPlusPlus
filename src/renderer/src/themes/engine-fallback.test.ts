import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { resolveTheme } from './engine';

// Simulates a pairing table that references a code theme which does not exist.
vi.mock('./presets/code-pairing', () => ({ autoCodeThemeId: () => 'missing-code-theme' }));

describe('resolveTheme with a broken pairing table', () => {
  it('falls back to the built-in code theme of the same kind', () => {
    expect(resolveTheme(DEFAULT_SETTINGS, true).code.id).toBe('one-dark-pro');
    expect(resolveTheme(DEFAULT_SETTINGS, false).code.id).toBe('github-light');
  });
});
