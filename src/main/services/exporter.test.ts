import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toMppFileUrl } from '../../shared/file-url';

type RequestFilter = (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void;

type LoadBehaviour = 'ok' | 'hang' | 'fail' | 'reject-string' | 'slow-subresources' | 'fail-after-dom-ready';

interface WindowRecord {
  options: unknown;
  loadedUrl: string | null;
  htmlAtLoad: string | null;
  destroyed: boolean;
  stopped: boolean;
  domReadyListeners: number;
}

interface ExportTestState {
  windows: WindowRecord[];
  loadBehaviour: LoadBehaviour;
  requestFilter: RequestFilter | null;
  permissionRequest:
    ((contents: unknown, permission: string, callback: (granted: boolean) => void) => void) | null;
  permissionCheck: (() => boolean) | null;
  fromPartition: ReturnType<typeof vi.fn>;
  showExportDialog: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted((): ExportTestState => ({
  windows: [],
  loadBehaviour: 'ok',
  requestFilter: null,
  permissionRequest: null,
  permissionCheck: null,
  fromPartition: vi.fn(),
  showExportDialog: vi.fn(),
}));

vi.mock('electron', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath: toPath } = await import('node:url');
  class BrowserWindow {
    private readonly record: WindowRecord;
    private readonly domReady = new Set<() => void>();
    private abortLoad: (() => void) | null = null;
    readonly webContents = {
      printToPDF: vi.fn(() => Promise.resolve(Buffer.from('%PDF-1.7 fake'))),
      once: (event: string, listener: () => void): void => {
        if (event !== 'dom-ready') return;
        const wrapped = (): void => {
          this.removeDomReady(wrapped, listener);
          listener();
        };
        this.domReadyOriginals.set(listener, wrapped);
        this.domReady.add(wrapped);
        this.record.domReadyListeners = this.domReady.size;
      },
      removeListener: (event: string, listener: () => void): void => {
        if (event !== 'dom-ready') return;
        const wrapped = this.domReadyOriginals.get(listener);
        if (wrapped) this.removeDomReady(wrapped, listener);
      },
      stop: (): void => {
        this.record.stopped = true;
        this.abortLoad?.();
      },
    };
    private readonly domReadyOriginals = new Map<() => void, () => void>();
    constructor(options: unknown) {
      this.record = {
        options,
        loadedUrl: null,
        htmlAtLoad: null,
        destroyed: false,
        stopped: false,
        domReadyListeners: 0,
      };
      state.windows.push(this.record);
    }
    private removeDomReady(wrapped: () => void, listener: () => void): void {
      this.domReady.delete(wrapped);
      this.domReadyOriginals.delete(listener);
      this.record.domReadyListeners = this.domReady.size;
    }
    private emitDomReady(): void {
      for (const listener of [...this.domReady]) listener();
    }
    loadURL(url: string): Promise<void> {
      this.record.loadedUrl = url;
      this.record.htmlAtLoad = readFileSync(toPath(url), 'utf8');
      switch (state.loadBehaviour) {
        case 'hang':
          return new Promise(() => undefined);
        case 'slow-subresources':
          // The document is parsed, but an image never arrives until the load is stopped.
          return new Promise((_resolve, reject) => {
            this.abortLoad = () => reject(new Error('ERR_ABORTED (-3) loading document'));
            setTimeout(() => this.emitDomReady(), 0);
          });
        case 'fail-after-dom-ready':
          return new Promise((_resolve, reject) => {
            setTimeout(() => {
              this.emitDomReady();
              setTimeout(() => reject(new Error('late failure')), 0);
            }, 0);
          });
        case 'fail':
          return Promise.reject(new Error('load failed'));
        case 'reject-string':
          // Deliberately not an Error: exercises the normalisation in withTimeout.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject('odd');
        default:
          this.emitDomReady();
          return Promise.resolve();
      }
    }
    isDestroyed(): boolean {
      return this.record.destroyed;
    }
    destroy(): void {
      this.record.destroyed = true;
    }
  }
  state.fromPartition.mockImplementation(() => ({
    setPermissionRequestHandler: (handler: typeof state.permissionRequest) => {
      state.permissionRequest = handler;
    },
    setPermissionCheckHandler: (handler: typeof state.permissionCheck) => {
      state.permissionCheck = handler;
    },
    webRequest: {
      onBeforeRequest: (handler: RequestFilter) => {
        state.requestFilter = handler;
      },
    },
  }));
  return { BrowserWindow, session: { fromPartition: state.fromPartition } };
});
vi.mock('../dialogs', () => ({ showExportDialog: state.showExportDialog }));

const {
  decodeAttribute,
  exportHtml,
  exportPdf,
  inlineLocalImages,
  PDF_PARTITION,
  PDF_SUBRESOURCE_BUDGET_MS,
  PDF_TIMEOUT_MS,
  renderHtmlToPdf,
} = await import('./exporter');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-export-'));
  state.windows.length = 0;
  state.loadBehaviour = 'ok';
  state.showExportDialog.mockReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('inlineLocalImages', () => {
  it('embeds allowlisted local images as data URIs', async () => {
    const png = join(dir, 'a b&c.png');
    await writeFile(png, Buffer.from([1, 2, 3]));
    const src = toMppFileUrl(png).replace(/&/g, '&amp;');
    const html = `<p><img alt="x" src="${src}"><img src='${src}' class="again"></p>`;
    const result = await inlineLocalImages(html);
    expect(result).toBe(
      '<p><img alt="x" src="data:image/png;base64,AQID"><img src=\'data:image/png;base64,AQID\' class="again"></p>',
    );
  });

  it('blanks images that cannot be embedded and keeps other sources untouched', async () => {
    await writeFile(join(dir, 'notes.txt'), 'secret');
    const html = [
      `<img src="${toMppFileUrl(join(dir, 'notes.txt'))}">`,
      `<img src="${toMppFileUrl(join(dir, 'missing.png'))}">`,
      '<img src="mpp-file://local/relative.png">',
      '<img src="https://example.com/a.png">',
      '<a href="mpp-file://local/%2Fa.png">link</a>',
    ].join('');
    expect(await inlineLocalImages(html)).toBe(
      '<img src=""><img src=""><img src=""><img src="https://example.com/a.png"><a href="mpp-file://local/%2Fa.png">link</a>',
    );
  });

  it('embeds images whose path contains an apostrophe, in either quote style', async () => {
    const pictures = join(dir, "Bob's Pictures");
    await mkdir(pictures);
    const png = join(pictures, 'a.png');
    await writeFile(png, Buffer.from([1, 2, 3]));
    const src = toMppFileUrl(png);
    expect(src).toContain("'");
    const html = [
      `<img src="${src}">`,
      `<img src='${src.replace(/'/g, '&#39;')}'>`,
      `<img src="${src.replace(/'/g, '&#x27;')}">`,
      `<img src="${src.replace(/'/g, '&apos;')}">`,
    ].join('');
    expect(await inlineLocalImages(html)).toBe(
      [
        '<img src="data:image/png;base64,AQID">',
        "<img src='data:image/png;base64,AQID'>",
        '<img src="data:image/png;base64,AQID">',
        '<img src="data:image/png;base64,AQID">',
      ].join(''),
    );
  });

  it('embeds images whose path contains a double quote in a single-quoted attribute', async () => {
    const png = join(dir, 'say "cheese".png');
    await writeFile(png, Buffer.from([7]));
    const src = toMppFileUrl(png);
    const html = `<img src='${src}'><img src="${src.replace(/"/g, '&quot;')}">`;
    expect(await inlineLocalImages(html)).toBe(
      '<img src=\'data:image/png;base64,Bw==\'><img src="data:image/png;base64,Bw==">',
    );
  });

  it('stops embedding once the size budget is exhausted', async () => {
    const exporter = await import('./exporter');
    expect(exporter.MAX_INLINED_IMAGE_BYTES).toBe(200 * 1024 * 1024);
    const big = join(dir, 'big.gif');
    await writeFile(big, Buffer.alloc(8));
    const html = `<img src="${toMppFileUrl(big)}">`;
    expect(await inlineLocalImages(html)).toContain('data:image/gif;base64,');
  });
});

describe('decodeAttribute', () => {
  it('decodes named, decimal and hexadecimal character references', () => {
    expect(decodeAttribute('a&amp;b&quot;c&apos;d&#39;e&#x27;f&#X41;g&LT;&gt;')).toBe("a&b\"c'd'e'fAg<>");
  });

  it('leaves unknown and invalid references untouched', () => {
    expect(decodeAttribute('&nbsp;&#0;&#xD800;&#x110000;&#;&amp')).toBe(
      '&nbsp;&#0;&#xD800;&#x110000;&#;&amp',
    );
  });
});

describe('renderHtmlToPdf', () => {
  it('prints from a temporary file in a locked-down hidden window and cleans up', async () => {
    const pdf = await renderHtmlToPdf('<h1>Report</h1>');
    expect(pdf.toString()).toBe('%PDF-1.7 fake');
    const [record] = state.windows;
    expect(record?.options).toMatchObject({
      show: false,
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    expect(record?.htmlAtLoad).toBe('<h1>Report</h1>');
    expect(record?.destroyed).toBe(true);
    expect(existsSync(fileURLToPath(record?.loadedUrl ?? ''))).toBe(false);
    expect(state.fromPartition).toHaveBeenCalledWith(PDF_PARTITION);
  });

  it('hardens the export session once', async () => {
    await renderHtmlToPdf('<p>one</p>');
    const calls = state.fromPartition.mock.calls.length;
    await renderHtmlToPdf('<p>two</p>');
    expect(state.fromPartition.mock.calls.length).toBe(calls);
    const granted = vi.fn();
    state.permissionRequest?.(null, 'media', granted);
    expect(granted).toHaveBeenCalledWith(false);
    expect(state.permissionCheck?.()).toBe(false);
  });

  it('only lets the current document, data and web resources through', async () => {
    const decisions: Record<string, boolean> = {};
    const decide = (url: string): void =>
      state.requestFilter?.({ url }, ({ cancel }) => {
        decisions[url] = cancel;
      });
    const promise = renderHtmlToPdf('<p>x</p>').then(() => undefined);
    await vi.waitFor(() => expect(state.windows.at(-1)?.loadedUrl).toBeTruthy());
    const currentUrl = state.windows.at(-1)?.loadedUrl ?? '';
    decide(currentUrl);
    decide('file:///etc/passwd');
    decide('data:image/png;base64,AA==');
    decide('https://example.com/a.png');
    decide('http://example.com/a.png');
    decide('ftp://example.com/a.png');
    await promise;
    decide(currentUrl);
    expect(decisions).toEqual({
      [currentUrl]: true,
      'file:///etc/passwd': true,
      'data:image/png;base64,AA==': false,
      'https://example.com/a.png': false,
      'http://example.com/a.png': false,
      'ftp://example.com/a.png': true,
    });
  });

  it('times out and still cleans up', async () => {
    state.loadBehaviour = 'hang';
    await expect(renderHtmlToPdf('<p>slow</p>', 20)).rejects.toThrow('PDF export timed out');
    expect(state.windows.at(-1)?.destroyed).toBe(true);
  });

  it('wraps non-error rejections', async () => {
    state.loadBehaviour = 'reject-string';
    await expect(renderHtmlToPdf('<p>odd</p>')).rejects.toThrow('odd');
  });

  it('propagates load failures', async () => {
    state.loadBehaviour = 'fail';
    await expect(renderHtmlToPdf('<p>broken</p>')).rejects.toThrow('load failed');
    expect(state.windows.at(-1)?.destroyed).toBe(true);
  });

  it('bounds the wait for subresources below the overall timeout', () => {
    expect(PDF_SUBRESOURCE_BUDGET_MS).toBe(10_000);
    expect(PDF_SUBRESOURCE_BUDGET_MS).toBeLessThan(PDF_TIMEOUT_MS);
  });

  it('prints without the images that are still loading once the budget elapses', async () => {
    state.loadBehaviour = 'slow-subresources';
    const pdf = await renderHtmlToPdf('<img src="https://unreachable.example/a.png">', 5_000, 20);
    expect(pdf.toString()).toBe('%PDF-1.7 fake');
    const record = state.windows.at(-1);
    expect(record?.stopped).toBe(true);
    expect(record?.domReadyListeners).toBe(0);
    expect(record?.destroyed).toBe(true);
  });

  it('does not stop a load that finishes normally', async () => {
    await renderHtmlToPdf('<p>fast</p>', 5_000, 20);
    const record = state.windows.at(-1);
    expect(record?.stopped).toBe(false);
    expect(record?.domReadyListeners).toBe(0);
  });

  it('propagates a load failure that happens after the document was parsed', async () => {
    state.loadBehaviour = 'fail-after-dom-ready';
    await expect(renderHtmlToPdf('<p>late</p>', 5_000, 5_000)).rejects.toThrow('late failure');
    const record = state.windows.at(-1);
    expect(record?.stopped).toBe(false);
    expect(record?.destroyed).toBe(true);
  });
});

describe('exportHtml / exportPdf', () => {
  it('returns null when the dialog is cancelled', async () => {
    state.showExportDialog.mockResolvedValue(null);
    expect(await exportHtml(null, { suggestedName: 'a.md', html: '<p/>' })).toBeNull();
    expect(await exportPdf(null, { suggestedName: 'a.md', html: '<p/>' })).toBeNull();
    expect(state.showExportDialog).toHaveBeenNthCalledWith(1, null, 'a.md', 'html', null);
    expect(state.showExportDialog).toHaveBeenNthCalledWith(2, null, 'a.md', 'pdf', null);
    expect(state.windows).toHaveLength(0);
  });

  it('starts the dialog in the given folder', async () => {
    state.showExportDialog.mockResolvedValue(null);
    await exportHtml(null, { suggestedName: 'a.md', html: '<p/>' }, { directory: '/work/docs' });
    await exportPdf(null, { suggestedName: 'a.md', html: '<p/>' }, { directory: '/work/docs' });
    expect(state.showExportDialog).toHaveBeenNthCalledWith(1, null, 'a.md', 'html', '/work/docs');
    expect(state.showExportDialog).toHaveBeenNthCalledWith(2, null, 'a.md', 'pdf', '/work/docs');
  });

  it('never embeds images from network paths the policy forbids', async () => {
    const target = join(dir, 'out.html');
    state.showExportDialog.mockResolvedValue(target);
    const html = `<img src="${toMppFileUrl('//evil.example/share/a.png')}">`;
    await exportHtml(null, { suggestedName: 'Doc', html }, { imagePolicy: { platform: 'win32' } });
    expect(await readFile(target, 'utf8')).toBe('<img src="">');
  });

  it('writes self-contained HTML', async () => {
    const png = join(dir, 'p.png');
    await writeFile(png, Buffer.from([9]));
    const target = join(dir, 'out.html');
    state.showExportDialog.mockResolvedValue(target);
    const html = `<!doctype html><img src="${toMppFileUrl(png)}">`;
    expect(await exportHtml(null, { suggestedName: 'Doc', html })).toBe(target);
    expect(await readFile(target, 'utf8')).toBe('<!doctype html><img src="data:image/png;base64,CQ==">');
  });

  it('writes the rendered PDF', async () => {
    const target = join(dir, 'out.pdf');
    state.showExportDialog.mockResolvedValue(target);
    expect(await exportPdf(null, { suggestedName: 'Doc', html: '<p>pdf</p>' })).toBe(target);
    expect(await readFile(target, 'utf8')).toBe('%PDF-1.7 fake');
  });
});
