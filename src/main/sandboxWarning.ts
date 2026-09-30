import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import { z } from 'zod';
import { readJsonFileSync, writeJsonFileSync } from './services/jsonStore';

/** File in the user data folder that remembers "Don't show this again". */
export const SANDBOX_WARNING_FILE = 'sandbox-warning.json';

const stateSchema = z.object({ version: z.literal(1), dismissed: z.boolean() });

/** What happened when the app checked whether the Chromium sandbox is active. */
export type SandboxWarningOutcome = 'not-needed' | 'dismissed' | 'continue' | 'quit';

/** Everything {@link warnIfSandboxDisabled} needs; injected so it can be unit tested. */
export interface SandboxWarningOptions {
  /** True when Chromium was started with `--no-sandbox`. */
  readonly sandboxDisabled: boolean;
  /** True when running from an AppImage (`$APPIMAGE` is set by its launcher). */
  readonly isAppImage: boolean;
  /** Absolute path of {@link SANDBOX_WARNING_FILE}. */
  readonly stateFile: string;
  /** Shows a native message box (normally `dialog.showMessageBox`, window-modal when possible). */
  readonly showMessageBox: (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>;
}

/** Response index of the "Quit" button. */
const QUIT = 1;

/**
 * The dialog shown when the app runs without the Chromium sandbox. The most
 * common cause is electron-builder's AppImage launcher, which adds
 * `--no-sandbox` on systems that restrict unprivileged user namespaces (e.g.
 * Ubuntu 24.04 with AppArmor) — MarkDown++ itself never disables the sandbox.
 */
export function sandboxWarningDialog(isAppImage: boolean): MessageBoxOptions {
  const cause = isAppImage
    ? 'The AppImage launcher turned the sandbox off because this system does not allow ' +
      'unprivileged user namespaces (for example Ubuntu 24.04 with AppArmor).'
    : 'The app was started with the --no-sandbox option.';
  return {
    type: 'warning',
    buttons: ['Continue', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    message: 'MarkDown++ is running without the Chromium sandbox',
    detail:
      `${cause}\n\nDocuments never run scripts, but a security flaw in Chromium would no longer be ` +
      'contained. For full protection install the .deb or .rpm package instead, or allow user ' +
      'namespaces as described in the installation guide.',
    checkboxLabel: "Don't show this again",
    checkboxChecked: false,
  };
}

function isDismissed(stateFile: string): boolean {
  const parsed = stateSchema.safeParse(readJsonFileSync(stateFile));
  return parsed.success && parsed.data.dismissed;
}

/**
 * Warns once per launch when the Chromium sandbox is disabled, unless the user
 * chose "Don't show this again" earlier. Remembering the choice is best effort:
 * a failed write only means the warning shows again next time.
 */
export async function warnIfSandboxDisabled(options: SandboxWarningOptions): Promise<SandboxWarningOutcome> {
  if (!options.sandboxDisabled) return 'not-needed';
  if (isDismissed(options.stateFile)) return 'dismissed';
  const result = await options.showMessageBox(sandboxWarningDialog(options.isAppImage));
  if (result.response === QUIT) return 'quit';
  if (result.checkboxChecked) {
    try {
      writeJsonFileSync(options.stateFile, { version: 1, dismissed: true });
    } catch (error) {
      console.warn('Could not remember the sandbox warning choice:', error);
    }
  }
  return 'continue';
}
