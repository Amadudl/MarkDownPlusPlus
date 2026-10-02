import { describe, expect, it, vi } from 'vitest';

/**
 * Fake image codec: a "PNG" here is JSON `{ width, height, fill }`; decoding yields a
 * bitmap whose bytes all equal `fill`, so the stitched result reveals tile order.
 */
interface FakePng {
  readonly width: number;
  readonly height: number;
  readonly fill: number;
}

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: (buffer: Buffer) => {
      const png = JSON.parse(buffer.toString('utf8')) as FakePng;
      return {
        getSize: () => ({ width: png.width, height: png.height }),
        toBitmap: () => Buffer.alloc(png.width * png.height * 4, png.fill),
      };
    },
    createFromBitmap: (data: Buffer, options: { width: number; height: number; scaleFactor: number }) => ({
      toPNG: () =>
        Buffer.concat([
          Buffer.from(`STITCHED ${options.width}x${options.height}@${options.scaleFactor}:`),
          data,
        ]),
    }),
  },
}));

const {
  capturePageAsPng,
  IMAGE_SCALE,
  IMAGE_TILE_DEVICE_HEIGHT,
  ImageTooLargeError,
  MAX_IMAGE_DEVICE_HEIGHT,
  planCapture,
  stitchBitmaps,
} = await import('./imageCapture');

describe('planCapture', () => {
  it('captures short pages at 2× in a single tile', () => {
    expect(planCapture(891.5, 1200.2)).toEqual({
      scale: IMAGE_SCALE,
      width: 892,
      height: 1201,
      tiles: [{ y: 0, height: 1201 }],
    });
  });

  it('splits tall pages into tiles below the Chromium capture limit', () => {
    const plan = planCapture(892, 10_000);
    expect(plan.scale).toBe(2);
    const tileCss = IMAGE_TILE_DEVICE_HEIGHT / 2;
    expect(plan.tiles).toEqual([
      { y: 0, height: tileCss },
      { y: tileCss, height: tileCss },
      { y: 2 * tileCss, height: 10_000 - 2 * tileCss },
    ]);
    for (const tile of plan.tiles)
      expect(tile.height * plan.scale).toBeLessThanOrEqual(IMAGE_TILE_DEVICE_HEIGHT);
  });

  it('falls back to 1× when 2× would exceed the maximum image height', () => {
    const plan = planCapture(892, MAX_IMAGE_DEVICE_HEIGHT / 2 + 1);
    expect(plan.scale).toBe(1);
    expect(plan.tiles.at(-1)).toEqual({ y: 2 * IMAGE_TILE_DEVICE_HEIGHT, height: 1 });
    expect(planCapture(892, MAX_IMAGE_DEVICE_HEIGHT).scale).toBe(1);
  });

  it('refuses documents that do not fit even at 1×', () => {
    expect(() => planCapture(892, MAX_IMAGE_DEVICE_HEIGHT + 1)).toThrow(ImageTooLargeError);
    expect(() => planCapture(892, 40_000.4)).toThrow(
      'The document is too long for a single image (40001 px; at most 32768 px). Export it as PDF instead.',
    );
  });

  it('never plans an empty image', () => {
    expect(planCapture(0, 0)).toEqual({ scale: 2, width: 1, height: 1, tiles: [{ y: 0, height: 1 }] });
  });
});

describe('stitchBitmaps', () => {
  const bitmap = (width: number, height: number, fill: number) => ({
    data: Buffer.alloc(width * height * 4, fill),
    width,
    height,
  });

  it('stacks tiles of equal width', () => {
    const result = stitchBitmaps([bitmap(2, 1, 1), bitmap(2, 2, 2)]);
    expect(result.width).toBe(2);
    expect(result.height).toBe(3);
    expect([...result.data]).toEqual([...Array<number>(8).fill(1), ...Array<number>(16).fill(2)]);
  });

  it('rejects empty, mismatched and malformed input', () => {
    expect(() => stitchBitmaps([])).toThrow('Nothing to stitch');
    expect(() => stitchBitmaps([bitmap(2, 1, 0), bitmap(3, 1, 0)])).toThrow('different widths');
    expect(() => stitchBitmaps([{ data: Buffer.alloc(3), width: 1, height: 1 }])).toThrow('unexpected size');
  });
});

/** A fake DevTools debugger for a page of the given CSS size. */
function fakeDebugger(
  size: unknown,
  options: { attached?: boolean; screenshot?: (params: unknown) => unknown } = {},
) {
  let attached = options.attached ?? false;
  let screenshots = 0;
  const calls: { method: string; params: unknown }[] = [];
  return {
    calls,
    attach: vi.fn(() => {
      attached = true;
    }),
    detach: vi.fn(() => {
      attached = false;
    }),
    isAttached: () => attached,
    sendCommand: vi.fn((method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === 'Page.getLayoutMetrics') return Promise.resolve(size);
      if (method === 'Page.captureScreenshot') {
        if (options.screenshot) return Promise.resolve(options.screenshot(params));
        const clip = (params as { clip: { width: number; height: number } }).clip;
        screenshots += 1;
        const scale = (
          calls.findLast((call) => call.method === 'Emulation.setDeviceMetricsOverride')?.params as {
            deviceScaleFactor: number;
          }
        ).deviceScaleFactor;
        const png: FakePng = { width: clip.width * scale, height: clip.height * scale, fill: screenshots };
        return Promise.resolve({ data: Buffer.from(JSON.stringify(png)).toString('base64') });
      }
      return Promise.resolve({});
    }),
  };
}

describe('capturePageAsPng', () => {
  it('returns a single-tile capture unchanged and detaches again', async () => {
    const target = fakeDebugger({ cssContentSize: { width: 892, height: 1000 } });
    const png = await capturePageAsPng(target, 892);
    expect(JSON.parse(png.toString())).toEqual({ width: 1784, height: 2000, fill: 1 });
    expect(target.attach).toHaveBeenCalledWith('1.3');
    expect(target.detach).toHaveBeenCalled();
    expect(target.calls.map((call) => call.method)).toEqual([
      'Emulation.setScrollbarsHidden',
      'Emulation.setDeviceMetricsOverride',
      'Page.getLayoutMetrics',
      'Emulation.setDeviceMetricsOverride',
      'Page.captureScreenshot',
    ]);
    expect(target.calls[0]?.params).toEqual({ hidden: true });
    expect(target.calls[1]?.params).toEqual({ width: 892, height: 800, mobile: false, deviceScaleFactor: 1 });
    expect(target.calls[3]?.params).toMatchObject({ deviceScaleFactor: 2 });
    expect(target.calls[4]?.params).toEqual({
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 892, height: 1000, scale: 1 },
    });
  });

  it('captures long pages tile by tile and stitches them in order', async () => {
    const target = fakeDebugger({ cssContentSize: { width: 10, height: 9000 } });
    const png = await capturePageAsPng(target, 10);
    const header = 'STITCHED 20x18000@1:';
    expect(png.subarray(0, header.length).toString()).toBe(header);
    const pixels = png.subarray(header.length);
    expect(pixels.length).toBe(20 * 18_000 * 4);
    // Tile 1 covers device rows 0..8191, tile 2 the rest: the fill values reveal the order.
    expect(pixels[0]).toBe(1);
    expect(pixels[20 * 8192 * 4 - 1]).toBe(1);
    expect(pixels[20 * 8192 * 4]).toBe(2);
    expect(pixels.at(-1)).toBe(3);
    const clips = target.calls
      .filter((call) => call.method === 'Page.captureScreenshot')
      .map((call) => (call.params as { clip: { y: number; height: number } }).clip);
    expect(clips.map(({ y, height }) => [y, height])).toEqual([
      [0, 4096],
      [4096, 4096],
      [8192, 808],
    ]);
  });

  it('captures exactly the requested width, even if the measured content is narrower or wider', async () => {
    for (const measured of [877, 1200]) {
      const target = fakeDebugger({ cssContentSize: { width: measured, height: 100 } });
      const png = await capturePageAsPng(target, 892);
      expect(JSON.parse(png.toString())).toMatchObject({ width: 1784 });
    }
  });

  it('leaves an already attached debugger attached', async () => {
    const target = fakeDebugger({ cssContentSize: { width: 892, height: 100 } }, { attached: true });
    await capturePageAsPng(target, 892);
    expect(target.attach).not.toHaveBeenCalled();
    expect(target.detach).not.toHaveBeenCalled();
  });

  it('fails clearly when the page cannot be measured', async () => {
    for (const size of [null, {}, { cssContentSize: null }, { cssContentSize: { width: '1', height: 2 } }]) {
      const target = fakeDebugger(size);
      await expect(capturePageAsPng(target, 892)).rejects.toThrow('Could not measure the document');
      expect(target.detach).toHaveBeenCalled();
    }
  });

  it('fails clearly when the renderer returns no screenshot', async () => {
    for (const reply of [null, {}, { data: 42 }]) {
      const target = fakeDebugger(
        { cssContentSize: { width: 892, height: 100 } },
        { screenshot: () => reply },
      );
      await expect(capturePageAsPng(target, 892)).rejects.toThrow('The renderer returned no screenshot');
    }
  });

  it('refuses documents that are too long before capturing anything', async () => {
    const target = fakeDebugger({ cssContentSize: { width: 892, height: MAX_IMAGE_DEVICE_HEIGHT + 10 } });
    await expect(capturePageAsPng(target, 892)).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(target.calls.some((call) => call.method === 'Page.captureScreenshot')).toBe(false);
    expect(target.detach).toHaveBeenCalled();
  });
});
