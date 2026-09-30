// Rasterises build/icon.svg into the PNG icons consumed by electron-builder.
//
// Usage: npm run icons (runs `electron scripts/generate-icons.mjs`)
//
// Electron (already a dev dependency) is used as the SVG renderer so that no
// native image library is needed. The SVG is drawn onto a <canvas> at every
// target size inside a hidden, sandboxed window; drawing the vector source at
// each size (instead of downscaling one large bitmap) keeps small icons crisp,
// and the canvas preserves the transparent margin of the icon exactly.
//
// Outputs:
//   build/icon.png                 1024 x 1024 (electron-builder derives .icns / .ico)
//   build/icons/<n>x<n>.png         Linux hicolor sizes
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(ROOT, 'build');
const SOURCE = join(BUILD_DIR, 'icon.svg');
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const MAIN_SIZE = 1024;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/**
 * Renders `svg` at `size` x `size` inside `win` and returns the PNG bytes.
 * The SVG is passed as a JSON string literal, never interpolated as markup.
 * @param {BrowserWindow} win
 * @param {string} svg
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function renderPng(win, svg, size) {
  const script = `(async () => {
    const svg = ${JSON.stringify(svg)};
    const size = ${String(size)};
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(size, size);
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  })()`;
  /** @type {unknown} */
  const dataUrl = await win.webContents.executeJavaScript(script, true);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error(`Rendering the icon at ${String(size)}px did not produce a PNG.`);
  }
  return Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64');
}

/** Reads the SVG, renders every size and writes the PNG files. */
async function generate() {
  const svg = await readFile(SOURCE, 'utf8');
  if (!svg.includes('<svg')) throw new Error(`${SOURCE} is not an SVG document.`);

  const win = new BrowserWindow({
    show: false,
    width: 256,
    height: 256,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      webSecurity: true,
    },
  });
  try {
    await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>icons</title>');
    await mkdir(join(BUILD_DIR, 'icons'), { recursive: true });

    await writeFile(join(BUILD_DIR, 'icon.png'), await renderPng(win, svg, MAIN_SIZE));
    process.stdout.write(`wrote build/icon.png (${String(MAIN_SIZE)}px)\n`);

    for (const size of LINUX_SIZES) {
      const name = `${String(size)}x${String(size)}.png`;
      await writeFile(join(BUILD_DIR, 'icons', name), await renderPng(win, svg, size));
      process.stdout.write(`wrote build/icons/${name}\n`);
    }
  } finally {
    win.destroy();
  }
}

app.disableHardwareAcceleration();
app.dock?.hide();
// Do not use top-level `await` here: Electron emits `ready` only after the ESM
// entry module has finished evaluating, so awaiting it at the top level deadlocks.
void app
  .whenReady()
  .then(generate)
  .then(
    () => app.exit(0),
    (/** @type {unknown} */ error) => {
      console.error(error instanceof Error ? error.message : error);
      app.exit(1);
    },
  );
