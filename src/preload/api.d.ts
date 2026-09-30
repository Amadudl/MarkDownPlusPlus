import type { MppApi } from '../shared/types';

declare global {
  interface Window {
    /** The MarkDown++ platform API exposed by the preload script. */
    readonly mpp: MppApi;
  }
}

export {};
