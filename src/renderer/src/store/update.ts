import { create } from 'zustand';
import type { UpdateInfo } from '@shared/types';

/** What the update notice shows; `null` hides it. */
export type UpdateNoticeState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'up-to-date'; readonly currentVersion: string }
  | { readonly kind: 'available'; readonly update: UpdateInfo }
  | {
      readonly kind: 'downloading';
      readonly update: UpdateInfo;
      readonly receivedBytes: number;
      readonly totalBytes: number;
    }
  | { readonly kind: 'verifying'; readonly update: UpdateInfo }
  | { readonly kind: 'restarting'; readonly update: UpdateInfo }
  | { readonly kind: 'disk-image-opened'; readonly update: UpdateInfo }
  | {
      readonly kind: 'error';
      readonly title: string;
      readonly message: string;
      /** The update the error belongs to (for "Open download page"), if one was found. */
      readonly update: UpdateInfo | null;
    };

/** State of the update notice. */
export interface UpdateState {
  readonly notice: UpdateNoticeState | null;
  show(notice: UpdateNoticeState): void;
  dismiss(): void;
}

/** The non-modal update notice of this window (see `commands/updates.ts`). */
export const useUpdate = create<UpdateState>()((set) => ({
  notice: null,
  show(notice) {
    set({ notice });
  },
  dismiss() {
    set({ notice: null });
  },
}));

/** True while an install is running or finishing, when nothing may replace the notice. */
export function isUpdateBusy(notice: UpdateNoticeState | null): boolean {
  return notice?.kind === 'downloading' || notice?.kind === 'verifying' || notice?.kind === 'restarting';
}

/** The update the notice is about, if any. */
export function noticeUpdate(notice: UpdateNoticeState | null): UpdateInfo | null {
  if (notice === null || notice.kind === 'checking' || notice.kind === 'up-to-date') return null;
  return notice.update;
}
