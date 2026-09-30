/**
 * Entry point of the Electron main process. All wiring lives in
 * {@link Application}; this module only starts it and reports fatal errors.
 */
import { app } from 'electron';
import { Application } from './application';

/** Starts the application and quits with a non-zero exit code if startup fails. */
export async function bootstrap(application: Application = new Application()): Promise<void> {
  try {
    await application.start();
  } catch (error) {
    console.error('MarkDown++ failed to start:', error);
    app.exit(1);
  }
}

void bootstrap();
