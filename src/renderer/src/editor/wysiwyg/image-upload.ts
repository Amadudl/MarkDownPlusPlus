/** Largest image (in bytes) that may be embedded into a document as a data URL. */
export const MAX_EMBEDDED_IMAGE_BYTES = 10 * 1024 * 1024;

/** Raster and vector formats Chromium can display; SVG is safe here because it is only ever used as `<img src>`. */
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/svg+xml',
]);

/**
 * Converts an image chosen in Crepe's image block into a self-contained
 * `data:` URL. Blob URLs (Crepe's default) would be written into the markdown
 * file and break after a restart, so the image is embedded instead.
 *
 * @throws Error when the file is not a supported image or exceeds {@link MAX_EMBEDDED_IMAGE_BYTES}.
 */
export function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return Promise.reject(new Error(`Unsupported image type: ${file.type === '' ? 'unknown' : file.type}`));
  }
  if (file.size > MAX_EMBEDDED_IMAGE_BYTES) {
    return Promise.reject(new Error('Images larger than 10 MB cannot be embedded.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/'))
        resolve(reader.result);
      else reject(new Error('The image could not be read.'));
    });
    reader.addEventListener('error', () => {
      reject(new Error('The image could not be read.'));
    });
    reader.readAsDataURL(file);
  });
}
