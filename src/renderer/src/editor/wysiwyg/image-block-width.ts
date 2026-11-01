/**
 * Keeps Crepe's image blocks in step with the width of the text column.
 *
 * Milkdown's image-block component writes a fixed pixel height onto the image when it
 * loads, computed from the column width at that moment (`style.height` plus
 * `data-origin`, the height for ratio 1, and `data-height`, the height after the
 * user's resize ratio). The width follows from that height, so a loaded image kept its
 * size when the column width changed (editor width setting, window size) until the
 * document was reopened. This module repeats Milkdown's calculation whenever the column
 * width changes, keeping the aspect ratio and the ratio set with the resize handle.
 */

/** Images rendered by Crepe's image-block component. */
const IMAGE_SELECTOR = 'img[data-type="image-block"]';
/** Host element of an image block; its width is the space the image may fill. */
const BLOCK_SELECTOR = '.milkdown-image-block';

/** Width changes up to this size (px) can come from the vertical scrollbar appearing or disappearing. */
export const SCROLLBAR_TOLERANCE = 32;
/** A small width change reverted within this time (ms) after resizing the images counts as scrollbar oscillation. */
export const OSCILLATION_WINDOW_MS = 250;

/**
 * Resizes one loaded image block image for `maxWidth` the way Milkdown does on load:
 * images narrower than `maxWidth` keep their natural height, wider ones are scaled down
 * to `maxWidth`, and the result is multiplied by the image's resize ratio. Images that
 * Milkdown has not sized yet (not loaded, or loaded while hidden) are left alone.
 *
 * @returns whether the image's height changed.
 */
export function fitImageBlockImage(image: HTMLImageElement, maxWidth: number): boolean {
  const origin = Number(image.dataset.origin);
  const height = Number(image.dataset.height);
  const { naturalWidth, naturalHeight } = image;
  if (!(origin > 0 && height > 0 && naturalWidth > 0 && naturalHeight > 0 && maxWidth > 0)) return false;
  // Milkdown stores the ratio with two decimals and derives data-height from it, so
  // rounding recovers the stored ratio and repeated resizes do not drift.
  const ratio = Number.parseFloat((height / origin).toFixed(2));
  const nextOrigin = naturalWidth < maxWidth ? naturalHeight : maxWidth * (naturalHeight / naturalWidth);
  const nextHeight = (nextOrigin * ratio).toFixed(2);
  image.dataset.origin = nextOrigin.toFixed(2);
  // The style normalises "500.00px" to "500px", so compare numbers.
  if (image.dataset.height === nextHeight && Number.parseFloat(image.style.height) === Number(nextHeight))
    return false;
  image.dataset.height = nextHeight;
  image.style.height = `${nextHeight}px`;
  return true;
}

/** Decides for which column width the images are sized. */
export interface WidthGuard {
  /**
   * Reports an observed column width. Returns the width to size the images for, or
   * `null` when they are already sized for it.
   */
  next(width: number, now: number): number | null;
}

/**
 * Creates a {@link WidthGuard} that breaks the feedback loop with the scrollbar of the
 * editor surface: resized images can make the document taller or shorter, which shows
 * or hides the scrollbar, which changes the column width again. When the width flips
 * back to the previous value by at most {@link SCROLLBAR_TOLERANCE} px within
 * {@link OSCILLATION_WINDOW_MS} ms of a resize, the images are sized for the narrower
 * of the two widths, which fits both layouts and ends the loop.
 */
export function createWidthGuard(): WidthGuard {
  let observed: number | null = null;
  let beforeObserved: number | null = null;
  let applied: number | null = null;
  let appliedAt = Number.NEGATIVE_INFINITY;
  return {
    next(width, now) {
      if (width === observed) return null;
      const flip =
        observed !== null &&
        beforeObserved === width &&
        Math.abs(width - observed) <= SCROLLBAR_TOLERANCE &&
        now - appliedAt <= OSCILLATION_WINDOW_MS;
      const effective = flip && observed !== null ? Math.min(width, observed) : width;
      beforeObserved = observed;
      observed = width;
      if (effective === applied) return null;
      applied = effective;
      appliedAt = now;
      return effective;
    },
  };
}

/**
 * Resizes the loaded image block images inside `root` (the ProseMirror editable)
 * whenever its content width changes. Work is batched into one animation frame; a
 * hidden editor (width 0) is ignored and catches up when it is shown again. Without
 * `ResizeObserver` (jsdom) the images keep Milkdown's behaviour.
 *
 * @returns a function that stops observing.
 */
export function observeImageBlockWidths(root: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  const guard = createWidthGuard();
  let width = 0;
  let frame = 0;

  const update = (): void => {
    frame = 0;
    if (width <= 0) return;
    const effective = guard.next(width, performance.now());
    if (effective === null) return;
    // Blocks inside lists or quotes are narrower than the column; keep their offset.
    const shrink = width - effective;
    for (const image of root.querySelectorAll<HTMLImageElement>(IMAGE_SELECTOR)) {
      const block = image.closest(BLOCK_SELECTOR);
      if (block !== null) fitImageBlockImage(image, block.getBoundingClientRect().width - shrink);
    }
  };

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) width = entry.contentRect.width;
    if (width > 0 && frame === 0) frame = requestAnimationFrame(update);
  });
  observer.observe(root);

  return () => {
    observer.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  };
}
