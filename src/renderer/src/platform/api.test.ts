import { afterEach, describe, expect, it } from 'vitest';
import { getApi, hasApi } from './api';
import { installFakeApi, uninstallFakeApi } from '@renderer/test/fakeApi';

describe('getApi', () => {
  afterEach(() => uninstallFakeApi());

  it('returns window.mpp when the preload exposed it', () => {
    const api = installFakeApi();
    expect(getApi()).toBe(api);
    expect(hasApi()).toBe(true);
  });

  it('throws a clear error without the preload API', () => {
    uninstallFakeApi();
    expect(hasApi()).toBe(false);
    expect(() => getApi()).toThrow(/window\.mpp/);
  });
});
