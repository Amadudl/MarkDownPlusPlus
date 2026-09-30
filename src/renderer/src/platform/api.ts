import type { MppApi } from '@shared/types';

interface WindowWithApi {
  readonly mpp?: MppApi;
}

/**
 * Returns the preload API (`window.mpp`). This is the only place in the renderer
 * that touches the global, which keeps the rest of the code testable with a fake.
 *
 * @throws Error when the preload script did not expose the API (e.g. the page was
 *   opened in a plain browser instead of the Electron shell).
 */
export function getApi(): MppApi {
  const api = (window as unknown as WindowWithApi).mpp;
  if (api === undefined) {
    throw new Error('MarkDown++ preload API (window.mpp) is not available. Start the app through Electron.');
  }
  return api;
}

/** True when the preload API is present. */
export function hasApi(): boolean {
  return (window as unknown as WindowWithApi).mpp !== undefined;
}
