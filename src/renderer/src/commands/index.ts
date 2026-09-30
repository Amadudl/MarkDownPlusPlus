import { isCommandId } from '@shared/commands';
import { getApi } from '@renderer/platform/api';
import { createCommandDefinitions } from './definitions';
import { executeCommand, registerCommands } from './registry';

export {
  executeCommand,
  getCommand,
  listCommands,
  registerCommands,
  shortcutLabel,
  shortcutText,
  type CommandCategory,
  type CommandDefinition,
} from './registry';
export { createCommandDefinitions, DOCUMENTATION_URL } from './definitions';

/** Registers the handler of every command id. Safe to call more than once. */
export function registerDefaultCommands(): void {
  registerCommands(createCommandDefinitions());
}

/**
 * Executes commands sent by the native application menu (the only place that
 * binds the keyboard accelerators).
 * @returns an unsubscribe function.
 */
export function bindMenuCommands(): () => void {
  return getApi().app.onMenuCommand((command, arg) => {
    if (isCommandId(command)) void executeCommand(command, arg);
  });
}
