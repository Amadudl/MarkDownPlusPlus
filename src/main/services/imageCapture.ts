import { nativeImage } from 'electron';

/** Pixel density of exported images (2 = sharp on high-DPI screens). */
export const IMAGE_SCALE = 2;
/**
 * Tallest single screenshot in device pixels. Chromium leaves captures taller than
 * about 16 384 device pixels blank below that line, so long documents are captured in
 * tiles of at most this height and stitched together.
 */
export const IMAGE_TILE_DEVICE_HEIGHT = 8192;
/**
 * Upper bound for the height of an exported image in device pixels. It keeps the
 * stitched bitmap within a sane amount of memory (≈ 250 MB at 1920 px width) and
 * within what image viewers open; longer documents are exported at 1× instead of 2×,
 * and documents that do not fit even then are refused with {@link ImageTooLargeError}.
 */
export const MAX_IMAGE_DEVICE_HEIGHT = 32_768;
/** Viewport height used while rendering (only affects the capture, not the layout width). */
const VIEWPORT_HEIGHT = 800;

/** Thrown when a document is too long to be exported as a single image. */
export class ImageTooLargeError extends Error {
  constructor(readonly cssHeight: number) {
    super(
      `The document is too long for a single image (${Math.ceil(cssHeight)} px; at most ` +
        `${MAX_IMAGE_DEVICE_HEIGHT} px). Export it as PDF instead.`,
    );
    this.name = 'ImageTooLargeError';
  }
}

/** A horizontal slice of the page, in CSS pixels. */
export interface CaptureTile {
  readonly y: number;
  readonly height: number;
}

/** How a page of the given size is captured. */
export interface CapturePlan {
  /** Device pixels per CSS pixel. */
  readonly scale: number;
  /** Page size in whole CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly CaptureTile[];
}

/**
 * Chooses the pixel density and splits the page into tiles that Chromium renders
 * reliably. Throws {@link ImageTooLargeError} when even 1× would exceed
 * {@link MAX_IMAGE_DEVICE_HEIGHT}.
 */
export function planCapture(cssWidth: number, cssHeight: number): CapturePlan {
  const width = Math.max(1, Math.ceil(cssWidth));
  const height = Math.max(1, Math.ceil(cssHeight));
  const scale = height * IMAGE_SCALE <= MAX_IMAGE_DEVICE_HEIGHT ? IMAGE_SCALE : 1;
  if (height * scale > MAX_IMAGE_DEVICE_HEIGHT) throw new ImageTooLargeError(cssHeight);
  const tileHeight = Math.floor(IMAGE_TILE_DEVICE_HEIGHT / scale);
  const tiles: CaptureTile[] = [];
  for (let y = 0; y < height; y += tileHeight) tiles.push({ y, height: Math.min(tileHeight, height - y) });
  return { scale, width, height, tiles };
}

/** A decoded bitmap (4 bytes per pixel in the platform's native order). */
export interface Bitmap {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

/** Stacks bitmaps of equal width vertically. */
export function stitchBitmaps(parts: readonly Bitmap[]): Bitmap {
  const first = parts[0];
  if (first === undefined) throw new Error('Nothing to stitch');
  let height = 0;
  for (const part of parts) {
    if (part.width !== first.width) throw new Error('Image tiles have different widths');
    if (part.data.length !== part.width * part.height * 4)
      throw new Error('Image tile has an unexpected size');
    height += part.height;
  }
  return { data: Buffer.concat(parts.map((part) => part.data)), width: first.width, height };
}

/** The part of `webContents.debugger` the capture needs (injected for tests). */
export interface CaptureDebugger {
  attach(protocolVersion?: string): void;
  detach(): void;
  isAttached(): boolean;
  sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface LayoutMetrics {
  readonly cssContentSize: { readonly width: number; readonly height: number };
}

function isLayoutMetrics(value: unknown): value is LayoutMetrics {
  if (typeof value !== 'object' || value === null || !('cssContentSize' in value)) return false;
  const size = value.cssContentSize;
  return (
    typeof size === 'object' &&
    size !== null &&
    typeof (size as { width?: unknown }).width === 'number' &&
    typeof (size as { height?: unknown }).height === 'number'
  );
}

function screenshotData(value: unknown): Buffer {
  const data = typeof value === 'object' && value !== null ? (value as { data?: unknown }).data : undefined;
  if (typeof data !== 'string') throw new Error('The renderer returned no screenshot');
  return Buffer.from(data, 'base64');
}

/**
 * Captures the whole loaded page as one PNG through the DevTools protocol, which
 * works with JavaScript disabled: lays the page out at `cssWidth`, measures it,
 * captures it in tiles (see {@link planCapture}) and stitches them losslessly.
 */
export async function capturePageAsPng(target: CaptureDebugger, cssWidth: number): Promise<Buffer> {
  const attachedHere = !target.isAttached();
  if (attachedHere) target.attach('1.3');
  try {
    const viewport = { width: Math.ceil(cssWidth), height: VIEWPORT_HEIGHT, mobile: false };
    await target.sendCommand('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    const metrics = await target.sendCommand('Page.getLayoutMetrics');
    if (!isLayoutMetrics(metrics)) throw new Error('Could not measure the document');
    const plan = planCapture(metrics.cssContentSize.width, metrics.cssContentSize.height);
    await target.sendCommand('Emulation.setDeviceMetricsOverride', {
      ...viewport,
      deviceScaleFactor: plan.scale,
    });
    const parts: Bitmap[] = [];
    for (const tile of plan.tiles) {
      const png = screenshotData(
        await target.sendCommand('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: tile.y, width: plan.width, height: tile.height, scale: 1 },
        }),
      );
      if (plan.tiles.length === 1) return png;
      const image = nativeImage.createFromBuffer(png);
      const { width, height } = image.getSize();
      parts.push({ data: image.toBitmap(), width, height });
    }
    const stitched = stitchBitmaps(parts);
    return nativeImage
      .createFromBitmap(stitched.data, { width: stitched.width, height: stitched.height, scaleFactor: 1 })
      .toPNG();
  } finally {
    if (attachedHere && target.isAttached()) target.detach();
  }
}
