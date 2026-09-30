// Development runner: starts the Vite dev server for the renderer, builds the
// main and preload bundles in watch mode and (re)launches Electron.
import { spawn } from 'node:child_process';
import { createServer, build } from 'vite';

const server = await createServer({ configFile: 'vite.renderer.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5183/';

/** @type {import('node:child_process').ChildProcess | null} */
let electronProcess = null;

function startElectron() {
  electronProcess?.kill();
  const child = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    env: { ...process.env, MPP_DEV_SERVER_URL: url },
    shell: process.platform === 'win32',
  });
  electronProcess = child;
  // Only quit the dev runner when the *current* Electron instance exits (the
  // user closed the window), not when we killed an old one to restart it.
  child.on('exit', () => {
    if (child === electronProcess) void shutdown();
  });
}

async function shutdown() {
  await server.close();
  process.exit(0);
}

let pending = 2;
for (const configFile of ['vite.main.config.ts', 'vite.preload.config.ts']) {
  const watcher = /** @type {import('rollup').RollupWatcher} */ (
    await build({ configFile, mode: 'development', build: { watch: {} } })
  );
  watcher.on('event', (event) => {
    if (event.code !== 'END') return;
    if (pending > 0 && --pending > 0) return;
    startElectron();
  });
}
