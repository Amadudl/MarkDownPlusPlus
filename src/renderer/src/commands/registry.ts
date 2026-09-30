import { type CommandIdValue } from '@shared/commands';
import { formatAccelerator, shortcutFor } from '@shared/shortcuts';
import { toastError } from '@renderer/store/ui';
import type { DesktopPlatform } from '@renderer/platform/platform';

/** Groups used by the command palette and the shortcut sheet. */
export type CommandCategory = 'File' | 'Edit' | 'View' | 'Format' | 'Settings' | 'Help';

/** A command the user can run from the menu, palette, toolbar or a shortcut. */
export interface CommandDefinition {
  readonly id: CommandIdValue;
  readonly label: string;
  readonly category: CommandCategory;
  /** False hides the command from the palette (e.g. commands that need an argument). */
  readonly inPalette: boolean;
  run(arg?: string): void | Promise<void>;
}

const registry = new Map<CommandIdValue, CommandDefinition>();

/** Registers (or replaces) command definitions. */
export function registerCommands(definitions: readonly CommandDefinition[]): void {
  for (const definition of definitions) registry.set(definition.id, definition);
}

/** All registered commands in registration order. */
export function listCommands(): readonly CommandDefinition[] {
  return [...registry.values()];
}

/** The definition of a command, if registered. */
export function getCommand(id: CommandIdValue): CommandDefinition | undefined {
  return registry.get(id);
}

/**
 * Runs a command. Errors are never swallowed silently: they surface as toasts.
 * @returns false when the command is unknown or failed.
 */
export async function executeCommand(id: CommandIdValue, arg?: string): Promise<boolean> {
  const command = registry.get(id);
  if (command === undefined) return false;
  try {
    await command.run(arg);
    return true;
  } catch (error) {
    toastError(`Command failed: ${command.label}`, error);
    return false;
  }
}

/** Like {@link shortcutLabel} but `undefined` when there is none (convenient for optional attributes). */
export function shortcutText(id: CommandIdValue, platform: DesktopPlatform): string | undefined {
  return shortcutLabel(id, platform) ?? undefined;
}

/** Human readable shortcut of a command for the given platform, or null. */
export function shortcutLabel(id: CommandIdValue, platform: DesktopPlatform): string | null {
  const accelerator = shortcutFor(id, platform);
  return accelerator === undefined ? null : formatAccelerator(accelerator, platform);
}
