const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx', 'txt']);

/** Last segment of a POSIX or Windows path. */
export function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index === -1 ? normalized : normalized.slice(index + 1);
}

/** Parent directory of a POSIX or Windows path ('' when there is none). */
export function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (index === -1) return '';
  return index === 0 ? path.slice(0, 1) : path.slice(0, index);
}

/** True for file names with a markdown (or plain text) extension. */
export function isMarkdownFileName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return MARKDOWN_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** File name without its extension, used as a default export name. */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
}
