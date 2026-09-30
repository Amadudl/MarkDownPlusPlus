import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_EMBEDDED_IMAGE_BYTES, readImageFileAsDataUrl } from './image-upload';

describe('readImageFileAsDataUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds a supported image as a data URL', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' });
    await expect(readImageFileAsDataUrl(file)).resolves.toBe('data:image/png;base64,iVBORw==');
  });

  it('rejects unsupported and untyped files', async () => {
    await expect(readImageFileAsDataUrl(new File(['x'], 'a.html', { type: 'text/html' }))).rejects.toThrow(
      'Unsupported image type: text/html',
    );
    await expect(readImageFileAsDataUrl(new File(['x'], 'a'))).rejects.toThrow(
      'Unsupported image type: unknown',
    );
  });

  it('rejects images above the size limit', async () => {
    const file = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: MAX_EMBEDDED_IMAGE_BYTES + 1 });
    await expect(readImageFileAsDataUrl(file)).rejects.toThrow('larger than 10 MB');
  });

  it('rejects when the reader fails or yields something unexpected', async () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' });
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent('error'));
    });
    await expect(readImageFileAsDataUrl(file)).rejects.toThrow('could not be read');

    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent('load'));
    });
    await expect(readImageFileAsDataUrl(file)).rejects.toThrow('could not be read');
  });
});
