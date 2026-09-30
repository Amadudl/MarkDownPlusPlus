import { describe, expect, it } from 'vitest';
import { PathRegistry } from './pathRegistry';

describe('PathRegistry', () => {
  it('grants normalised paths', () => {
    const registry = new PathRegistry('linux');
    expect(registry.has('/a/b.md')).toBe(false);
    registry.add('/a/./x/../b.md');
    expect(registry.has('/a/b.md')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('is case-sensitive outside Windows', () => {
    const registry = new PathRegistry('darwin');
    registry.add('/a/B.md');
    expect(registry.has('/a/b.md')).toBe(false);
  });

  it('is case-insensitive on Windows', () => {
    const registry = new PathRegistry('win32');
    registry.add('/Docs/Readme.MD');
    expect(registry.has('/docs/readme.md')).toBe(true);
  });

  it('knows the servers of granted network paths', () => {
    const registry = new PathRegistry('win32');
    registry.add('C:\\local\\doc.md');
    expect(registry.hasUncHost('server')).toBe(false);
    registry.add('\\\\Server\\share\\doc.md');
    expect(registry.hasUncHost('server')).toBe(true);
    expect(registry.hasUncHost('SERVER')).toBe(true);
    expect(registry.hasUncHost('evil')).toBe(false);
  });

  it('defaults to the current platform', () => {
    const registry = new PathRegistry();
    registry.add('/x.md');
    expect(registry.has('/x.md')).toBe(true);
  });
});
