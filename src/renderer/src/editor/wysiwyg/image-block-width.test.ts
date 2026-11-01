import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWidthGuard,
  fitImageBlockImage,
  observeImageBlockWidths,
  OSCILLATION_WINDOW_MS,
  SCROLLBAR_TOLERANCE,
} from './image-block-width';

/** An image as Milkdown leaves it after loading: natural size, data-origin, data-height and inline height. */
function loadedImage(
  naturalWidth: number,
  naturalHeight: number,
  origin: number,
  ratio = 1,
): HTMLImageElement {
  const image = document.createElement('img');
  image.dataset.type = 'image-block';
  Object.defineProperty(image, 'naturalWidth', { value: naturalWidth });
  Object.defineProperty(image, 'naturalHeight', { value: naturalHeight });
  const height = (origin * ratio).toFixed(2);
  image.dataset.origin = origin.toFixed(2);
  image.dataset.height = height;
  image.style.height = `${height}px`;
  return image;
}

describe('fitImageBlockImage', () => {
  it('scales an image wider than the column to the column width', () => {
    const image = loadedImage(3000, 1500, 390);
    expect(fitImageBlockImage(image, 1400)).toBe(true);
    expect(image.dataset.origin).toBe('700.00');
    expect(image.dataset.height).toBe('700.00');
    expect(image.style.height).toBe('700px');
  });

  it('keeps the natural height of an image narrower than the column', () => {
    const image = loadedImage(400, 300, 150);
    expect(fitImageBlockImage(image, 1000)).toBe(true);
    expect(image.dataset.origin).toBe('300.00');
    expect(image.style.height).toBe('300px');
  });

  it('keeps the ratio set with the resize handle', () => {
    const image = loadedImage(2000, 1000, 390, 1.5);
    fitImageBlockImage(image, 1000);
    expect(image.dataset.origin).toBe('500.00');
    expect(image.dataset.height).toBe('750.00');
    // The ratio Milkdown stores at the end of a drag stays the same.
    expect(Number(image.dataset.height) / Number(image.dataset.origin)).toBe(1.5);
  });

  it('does not drift over repeated resizes', () => {
    const image = loadedImage(1999, 1333, 333.33, 0.73);
    for (const width of [781, 1203, 457, 999, 781]) fitImageBlockImage(image, width);
    const once = loadedImage(1999, 1333, 333.33, 0.73);
    fitImageBlockImage(once, 781);
    expect(image.dataset.height).toBe(once.dataset.height);
  });

  it('reports no change when the image already fits', () => {
    const image = loadedImage(3000, 1500, 500);
    expect(fitImageBlockImage(image, 1000)).toBe(false);
    expect(image.style.height).toBe('500px');
  });

  it.each([
    ['not sized by Milkdown', (image: HTMLImageElement) => delete image.dataset.origin],
    ['without data-height', (image: HTMLImageElement) => delete image.dataset.height],
  ])('leaves an image %s alone', (_name, prepare) => {
    const image = loadedImage(3000, 1500, 390);
    prepare(image);
    expect(fitImageBlockImage(image, 1400)).toBe(false);
    expect(image.style.height).toBe('390px');
  });

  it('leaves images without a natural size and hidden columns alone', () => {
    expect(fitImageBlockImage(loadedImage(0, 0, 100), 1400)).toBe(false);
    expect(fitImageBlockImage(loadedImage(3000, 1500, 390), 0)).toBe(false);
  });
});

describe('createWidthGuard', () => {
  it('sizes for every new width and skips repeated ones', () => {
    const guard = createWidthGuard();
    expect(guard.next(780, 0)).toBe(780);
    expect(guard.next(780, 10)).toBeNull();
    expect(guard.next(1400, 20)).toBe(1400);
    expect(guard.next(780, 30)).toBe(780);
  });

  it('ends a scrollbar oscillation on the narrower width', () => {
    const guard = createWidthGuard();
    expect(guard.next(1400, 0)).toBe(1400);
    // Taller images show the scrollbar: the column narrows.
    expect(guard.next(1390, 16)).toBe(1390);
    // Narrower images hide it again: the width flips back, the images stay.
    expect(guard.next(1400, 32)).toBeNull();
    expect(guard.next(1390, 48)).toBeNull();
    expect(guard.next(1400, 64)).toBeNull();
  });

  it('treats slow or large reverts as real width changes', () => {
    const slow = createWidthGuard();
    slow.next(1400, 0);
    slow.next(1390, 0);
    expect(slow.next(1400, OSCILLATION_WINDOW_MS + 1)).toBe(1400);

    const large = createWidthGuard();
    large.next(780, 0);
    large.next(780 + SCROLLBAR_TOLERANCE + 1, 0);
    expect(large.next(780, 1)).toBe(780);
  });
});

describe('observeImageBlockWidths', () => {
  let observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  beforeEach(() => {
    observers = [];
    frames = new Map();
    nextFrame = 1;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly disconnect = vi.fn();
        constructor(callback: ResizeObserverCallback) {
          observers.push({ callback, disconnect: this.disconnect });
        }
        observe(): void {
          // driven by resize() below
        }
      },
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** An editable with one image block whose host is `blockWidth` px wide. */
  function editable(blockWidth: () => number): { root: HTMLElement; image: HTMLImageElement } {
    const root = document.createElement('div');
    const block = document.createElement('div');
    block.className = 'milkdown-image-block';
    vi.spyOn(block, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, blockWidth(), 0));
    const image = loadedImage(3000, 1500, 390);
    block.append(image);
    // An image-block image outside a block host (never rendered by Crepe) is skipped.
    root.append(block, loadedImage(3000, 1500, 390));
    return { root, image };
  }

  function resize(width: number): void {
    const observer = observers[0];
    if (observer === undefined) throw new Error('not observing');
    const entry = { contentRect: new DOMRect(0, 0, width, 100) } as ResizeObserverEntry;
    observer.callback([entry], {} as ResizeObserver);
  }

  function runFrames(): void {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  }

  it('resizes loaded image blocks once per frame when the column width changes', () => {
    let width = 780;
    const { root, image } = editable(() => width);
    const stop = observeImageBlockWidths(root);
    resize(780);
    runFrames();
    expect(image.style.height).toBe('390px');

    width = 1400;
    resize(1200);
    resize(1400);
    expect(frames.size).toBe(1);
    runFrames();
    expect(image.style.height).toBe('700px');
    stop();
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });

  it('ignores a hidden editor and catches up when it is shown', () => {
    let width = 780;
    const { root, image } = editable(() => width);
    observeImageBlockWidths(root);
    resize(780);
    runFrames();
    resize(0);
    expect(frames.size).toBe(0);
    width = 1400;
    resize(1400);
    runFrames();
    expect(image.style.height).toBe('700px');
  });

  it('keeps the images when the editor is hidden while a frame is pending', () => {
    const { root, image } = editable(() => 1400);
    observeImageBlockWidths(root);
    resize(1400);
    resize(0);
    runFrames();
    expect(image.style.height).toBe('390px');
  });

  it('keeps blocks narrower than the column inset during a scrollbar oscillation', () => {
    let width = 1400;
    const { root, image } = editable(() => width - 40);
    observeImageBlockWidths(root);
    resize(1400);
    runFrames();
    expect(image.style.height).toBe('680px');
    width = 1390;
    resize(1390);
    runFrames();
    expect(image.style.height).toBe('675px');
    width = 1400;
    resize(1400);
    runFrames();
    expect(image.style.height).toBe('675px');
  });

  it('cancels a pending frame when it stops', () => {
    const { root } = editable(() => 1400);
    const stop = observeImageBlockWidths(root);
    resize(1400);
    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
  });

  it('does nothing without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { root, image } = editable(() => 1400);
    const stop = observeImageBlockWidths(root);
    stop();
    expect(observers).toHaveLength(0);
    expect(image.style.height).toBe('390px');
  });
});
