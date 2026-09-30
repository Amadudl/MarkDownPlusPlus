import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, session, type Session } from 'electron';
import { fromMppFileUrl } from '../../shared/file-url';
import type { ExportHtmlRequest, ExportPdfRequest } from '../../shared/types';
import { showExportDialog } from '../dialogs';
import { writeFileAtomic } from './atomicWrite';
import { readLocalImage, type LocalImagePolicy } from './localImages';

/** Maximum wall-clock time of a PDF render. */
export const PDF_TIMEOUT_MS = 30_000;
/** Upper bound for the sum of all images embedded into one export (200 MB). */
export const MAX_INLINED_IMAGE_BYTES = 200 * 1024 * 1024;
/** Isolated in-memory session used for rendering PDFs. */
export const PDF_PARTITION = 'mpp-pdf-export';

/**
 * Longest time the PDF renderer waits for subresources (remote images) once the
 * document itself has been parsed. When it elapses, loading is stopped and the page
 * is printed with whatever has arrived, so one unreachable image host cannot make
 * the whole export time out.
 */
export const PDF_SUBRESOURCE_BUDGET_MS = 10_000;

/**
 * `<img ... src="mpp-file://local/...">` with either quote style. Each quote style is
 * matched on its own because the other quote character may legally occur inside the
 * value (`encodeURIComponent` keeps `'`, e.g. in `Bob's Pictures`).
 */
const MPP_IMG_SRC =
  /(<img\b[^>]*?\ssrc\s*=\s*)(?:"(mpp-file:\/\/local\/[^"]*)"|'(mpp-file:\/\/local\/[^']*)')/gi;

const NAMED_REFERENCES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function decodeCodePoint(codePoint: number, reference: string): string {
  const valid =
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff);
  return valid ? String.fromCodePoint(codePoint) : reference;
}

/**
 * Decodes the HTML character references that can appear in a serialised attribute
 * value: decimal and hexadecimal numeric references and the basic named ones.
 * Unknown or invalid references are left untouched.
 */
export function decodeAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#[xX]([\da-fA-F]+)|([a-zA-Z]+));/g,
    // Exactly one group matches; `name` is set whenever the numeric groups are not.
    (reference, decimal: string | undefined, hex: string | undefined, name: string) => {
      if (decimal !== undefined) return decodeCodePoint(Number.parseInt(decimal, 10), reference);
      if (hex !== undefined) return decodeCodePoint(Number.parseInt(hex, 16), reference);
      return NAMED_REFERENCES[name.toLowerCase()] ?? reference;
    },
  );
}

/** One `mpp-file:` image source; `url` is the raw (still HTML-encoded) attribute value. */
interface MppImageMatch {
  readonly prefix: string;
  readonly quote: '"' | "'";
  readonly url: string;
}

/**
 * Exactly one quote group of {@link MPP_IMG_SRC} matches: the single-quoted one
 * whenever `doubleQuoted` is unset.
 */
function toImageMatch(prefix: string, doubleQuoted: string | undefined, singleQuoted: string): MppImageMatch {
  return doubleQuoted !== undefined
    ? { prefix, quote: '"', url: doubleQuoted }
    : { prefix, quote: "'", url: singleQuoted };
}

/**
 * Replaces every `<img src="mpp-file://local/...">` in an HTML document with an
 * embedded `data:` URI so that exported files are self-contained. The same
 * allowlist and size limits as the `mpp-file:` protocol apply; images that
 * cannot be embedded get an empty `src` instead of a dangling local reference.
 */
export async function inlineLocalImages(html: string, policy: LocalImagePolicy = {}): Promise<string> {
  const urls = new Set<string>();
  html.replace(MPP_IMG_SRC, (match, prefix: string, dq: string | undefined, sq: string) => {
    urls.add(toImageMatch(prefix, dq, sq).url);
    return match;
  });
  const replacements = new Map<string, string>();
  let budget = MAX_INLINED_IMAGE_BYTES;
  for (const url of urls) {
    const path = fromMppFileUrl(decodeAttribute(url));
    const image = path === null ? null : await readLocalImage(path, policy);
    if (image?.kind === 'ok' && image.data.byteLength <= budget) {
      budget -= image.data.byteLength;
      replacements.set(url, `data:${image.mimeType};base64,${image.data.toString('base64')}`);
    } else {
      replacements.set(url, '');
    }
  }
  return html.replace(MPP_IMG_SRC, (_match, prefix: string, dq: string | undefined, sq: string) => {
    const image = toImageMatch(prefix, dq, sq);
    return `${image.prefix}${image.quote}${replacements.get(image.url) ?? ''}${image.quote}`;
  });
}

const allowedPdfFiles = new Set<string>();
let hardenedPdfSession: Session | null = null;

/**
 * Returns the export session, locked down once: no permissions, and no access
 * to local files except the temporary document currently being rendered.
 */
function pdfSession(): Session {
  if (hardenedPdfSession) return hardenedPdfSession;
  const ses = session.fromPartition(PDF_PARTITION);
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const { protocol } = new URL(details.url);
    const allowed =
      protocol === 'data:' ||
      protocol === 'https:' ||
      protocol === 'http:' ||
      (protocol === 'file:' && allowedPdfFiles.has(details.url));
    callback({ cancel: !allowed });
  });
  hardenedPdfSession = ses;
  return ses;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('PDF export timed out')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Loads `url` into `window` and resolves once it is printable: when the load has
 * finished, or — after the main document has been parsed — when
 * `subresourceBudgetMs` has elapsed, in which case pending subresources are aborted
 * with `webContents.stop()`. Rejects when the document itself fails to load.
 */
async function loadForPrinting(
  window: BrowserWindow,
  url: string,
  subresourceBudgetMs: number,
): Promise<void> {
  const { webContents } = window;
  let resolveDomReady: () => void;
  const domReady = new Promise<void>((resolvePromise) => {
    resolveDomReady = resolvePromise;
  });
  // The executor above runs synchronously, so `resolveDomReady` is always assigned here.
  const onDomReady = (): void => resolveDomReady();
  webContents.once('dom-ready', onDomReady);
  const loaded = window.loadURL(url).then(() => 'loaded' as const);
  // Stopping the load below makes `loadURL` reject (ERR_ABORTED); that is expected.
  loaded.catch(() => undefined);
  try {
    // Rejects when the document itself cannot be loaded.
    await Promise.race([loaded, domReady]);
    let budgetTimer: ReturnType<typeof setTimeout> | undefined;
    const budgetElapsed = new Promise<'budget'>((resolvePromise) => {
      budgetTimer = setTimeout(() => resolvePromise('budget'), subresourceBudgetMs);
    });
    try {
      // An already finished load wins the race immediately.
      if ((await Promise.race([loaded, budgetElapsed])) === 'budget') webContents.stop();
    } finally {
      clearTimeout(budgetTimer);
    }
  } finally {
    webContents.removeListener('dom-ready', onDomReady);
  }
}

/**
 * Renders a complete HTML document to an A4 PDF in a hidden, sandboxed window
 * with JavaScript disabled. The document is loaded from a temporary file which
 * is deleted afterwards. Subresources (remote images) get at most
 * `subresourceBudgetMs` after the document has been parsed; images still pending
 * then are left out instead of failing the export.
 */
export async function renderHtmlToPdf(
  html: string,
  timeoutMs: number = PDF_TIMEOUT_MS,
  subresourceBudgetMs: number = PDF_SUBRESOURCE_BUDGET_MS,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'mpp-pdf-'));
  const file = join(dir, 'document.html');
  const fileUrl = pathToFileURL(file).href;
  try {
    await writeFile(file, html, { encoding: 'utf8', mode: 0o600 });
    allowedPdfFiles.add(fileUrl);
    const exportWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 1400,
      webPreferences: {
        javascript: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        session: pdfSession(),
      },
    });
    try {
      return await withTimeout(
        (async () => {
          await loadForPrinting(exportWindow, fileUrl, subresourceBudgetMs);
          return exportWindow.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
          });
        })(),
        timeoutMs,
      );
    } finally {
      if (!exportWindow.isDestroyed()) exportWindow.destroy();
    }
  } finally {
    allowedPdfFiles.delete(fileUrl);
    await rm(dir, { recursive: true, force: true });
  }
}

/** Options of {@link exportHtml} and {@link exportPdf}. */
export interface ExportOptions {
  /** Folder the save dialog starts in (the document's folder); defaults to Documents. */
  readonly directory?: string | null;
  /** Which local images may be embedded (see {@link readLocalImage}). */
  readonly imagePolicy?: LocalImagePolicy;
}

/** Exports a sanitised HTML document to a user-chosen `.html` file; returns its path or `null`. */
export async function exportHtml(
  parent: BrowserWindow | null,
  request: ExportHtmlRequest,
  options: ExportOptions = {},
): Promise<string | null> {
  const target = await showExportDialog(parent, request.suggestedName, 'html', options.directory ?? null);
  if (target === null) return null;
  await writeFileAtomic(target, await inlineLocalImages(request.html, options.imagePolicy));
  return target;
}

/** Exports a sanitised HTML document as PDF to a user-chosen file; returns its path or `null`. */
export async function exportPdf(
  parent: BrowserWindow | null,
  request: ExportPdfRequest,
  options: ExportOptions = {},
): Promise<string | null> {
  const target = await showExportDialog(parent, request.suggestedName, 'pdf', options.directory ?? null);
  if (target === null) return null;
  const pdf = await renderHtmlToPdf(await inlineLocalImages(request.html, options.imagePolicy));
  await writeFileAtomic(target, pdf);
  return target;
}
