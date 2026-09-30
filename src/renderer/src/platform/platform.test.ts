import { describe, expect, it } from 'vitest';
import { applyPlatformClass, detectPlatform, toDesktopPlatform } from './platform';

describe('detectPlatform', () => {
  it('detects macOS, Windows and Linux', () => {
    expect(detectPlatform({ userAgent: 'x', platform: 'MacIntel' })).toBe('darwin');
    expect(detectPlatform({ userAgent: 'Mozilla (Windows NT 10.0)' })).toBe('win32');
    expect(detectPlatform({ userAgent: 'Mozilla (X11; Linux x86_64)', platform: 'Linux x86_64' })).toBe(
      'linux',
    );
  });

  it('uses the real navigator by default', () => {
    expect(['darwin', 'win32', 'linux']).toContain(detectPlatform());
  });
});

describe('toDesktopPlatform', () => {
  it('keeps darwin/win32 and maps everything else to linux', () => {
    expect(toDesktopPlatform('darwin')).toBe('darwin');
    expect(toDesktopPlatform('win32')).toBe('win32');
    expect(toDesktopPlatform('freebsd')).toBe('linux');
  });
});

describe('applyPlatformClass', () => {
  it('sets exactly one platform class', () => {
    applyPlatformClass('win32');
    expect(document.body).toHaveClass('platform-win32');
    applyPlatformClass('darwin');
    expect(document.body).toHaveClass('platform-darwin');
    expect(document.body).not.toHaveClass('platform-win32');
  });
});
