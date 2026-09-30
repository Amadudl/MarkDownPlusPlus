import { create } from 'zustand';
import type { AppInfo } from '@shared/types';
import type { CursorInfo } from '@renderer/editor/types';
import { detectPlatform, type DesktopPlatform } from '@renderer/platform/platform';

/** Modal dialogs of the shell. Only one can be open at a time. */
export type DialogId = 'settings' | 'shortcuts' | 'about';

/** Sections of the settings dialog. */
export type SettingsSection = 'appearance' | 'code' | 'elements' | 'editor' | 'general' | 'about';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
  readonly detail?: string;
}

export interface ToastOptions {
  readonly detail?: string;
  /** Milliseconds before auto-dismiss; 0 keeps the toast until dismissed. */
  readonly durationMs?: number;
}

export interface FindBarState {
  readonly open: boolean;
  readonly replace: boolean;
  /** Incremented on every open request so the input can re-focus/select. */
  readonly focusToken: number;
}

/** Plain data part of the UI store. */
export interface UiData {
  readonly dialog: DialogId | null;
  readonly settingsSection: SettingsSection;
  readonly paletteOpen: boolean;
  readonly findBar: FindBarState;
  readonly outlineVisible: boolean;
  readonly focusMode: boolean;
  readonly toolbarCollapsed: boolean;
  readonly toasts: readonly Toast[];
  readonly prefersDark: boolean;
  readonly platform: DesktopPlatform;
  readonly appInfo: AppInfo | null;
  readonly cursors: Readonly<Record<string, CursorInfo>>;
  readonly dropActive: boolean;
}

export interface UiState extends UiData {
  openDialog(dialog: DialogId, section?: SettingsSection): void;
  closeDialog(): void;
  setSettingsSection(section: SettingsSection): void;
  setPaletteOpen(open: boolean): void;
  openFind(replace: boolean): void;
  closeFind(): void;
  setOutlineVisible(visible: boolean): void;
  toggleFocusMode(): void;
  setToolbarCollapsed(collapsed: boolean): void;
  pushToast(kind: ToastKind, message: string, options?: ToastOptions): number;
  dismissToast(id: number): void;
  setPrefersDark(prefersDark: boolean): void;
  setPlatform(platform: DesktopPlatform): void;
  setAppInfo(info: AppInfo): void;
  setCursor(docId: string, info: CursorInfo): void;
  setDropActive(active: boolean): void;
}

/** Default auto-dismiss durations per toast kind. */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  error: 8000,
};

const MAX_TOASTS = 5;
let toastSequence = 0;

/** Reads the OS colour-scheme preference; false when `matchMedia` is unavailable. */
export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Initial state (without actions), exported so tests can reset the store. */
export function initialUiState(): UiData {
  return {
    dialog: null,
    settingsSection: 'appearance',
    paletteOpen: false,
    findBar: { open: false, replace: false, focusToken: 0 },
    outlineVisible: false,
    focusMode: false,
    toolbarCollapsed: false,
    toasts: [],
    prefersDark: systemPrefersDark(),
    platform: detectPlatform(),
    appInfo: null,
    cursors: {},
    dropActive: false,
  };
}

/** Transient UI state: dialogs, palette, find bar, panels, toasts and environment facts. */
export const useUi = create<UiState>()((set, get) => ({
  ...initialUiState(),

  openDialog(dialog, section) {
    set((state) => ({ dialog, paletteOpen: false, settingsSection: section ?? state.settingsSection }));
  },
  closeDialog() {
    set({ dialog: null });
  },
  setSettingsSection(section) {
    set({ settingsSection: section });
  },
  setPaletteOpen(open) {
    set({ paletteOpen: open });
  },
  openFind(replace) {
    set((state) => ({ findBar: { open: true, replace, focusToken: state.findBar.focusToken + 1 } }));
  },
  closeFind() {
    set((state) => ({ findBar: { ...state.findBar, open: false, replace: false } }));
  },
  setOutlineVisible(visible) {
    set({ outlineVisible: visible });
  },
  toggleFocusMode() {
    set((state) => ({ focusMode: !state.focusMode }));
  },
  setToolbarCollapsed(collapsed) {
    set({ toolbarCollapsed: collapsed });
  },
  pushToast(kind, message, options = {}) {
    toastSequence += 1;
    const id = toastSequence;
    const toast: Toast =
      options.detail === undefined ? { id, kind, message } : { id, kind, message, detail: options.detail };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_TOASTS) }));
    const duration = options.durationMs ?? TOAST_DURATION_MS[kind];
    if (duration > 0) setTimeout(() => get().dismissToast(id), duration);
    return id;
  },
  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  setPrefersDark(prefersDark) {
    set({ prefersDark });
  },
  setPlatform(platform) {
    set({ platform });
  },
  setAppInfo(info) {
    set({ appInfo: info });
  },
  setCursor(docId, info) {
    set((state) => ({ cursors: { ...state.cursors, [docId]: info } }));
  },
  setDropActive(active) {
    set({ dropActive: active });
  },
}));

/** Convenience for non-React code: shows an error toast built from any thrown value. */
export function toastError(message: string, error: unknown): void {
  useUi.getState().pushToast('error', message, { detail: errorMessage(error) });
}

/** Extracts a readable message from an unknown thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * Keeps `prefersDark` in sync with the OS colour scheme.
 * @returns an unsubscribe function.
 */
export function watchSystemColorScheme(): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (event: MediaQueryListEvent): void => useUi.getState().setPrefersDark(event.matches);
  useUi.getState().setPrefersDark(query.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
