import { isAbsolute } from 'node:path';
import { z } from 'zod';

/** Longest path accepted over IPC (the Windows extended-length limit). */
export const MAX_PATH_LENGTH = 32_767;
/** Largest HTML document accepted for export (50 MB of UTF-16 code units). */
export const MAX_HTML_LENGTH = 50 * 1024 * 1024;
/** Largest markdown document accepted for saving. */
export const MAX_CONTENT_LENGTH = 50 * 1024 * 1024;

/** An absolute file system path without NUL bytes. */
export const absolutePathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((value) => !value.includes('\0'), 'Paths must not contain NUL bytes')
  .refine((value) => isAbsolute(value), 'Expected an absolute path');

/** A short single-line label such as a document title or file name. */
export const labelSchema = z.string().max(512);

export const lineEndingSchema = z.enum(['lf', 'crlf']);
export const editorModeSchema = z.enum(['wysiwyg', 'source']);

export const fileSaveRequestSchema = z.object({
  path: absolutePathSchema,
  content: z.string().max(MAX_CONTENT_LENGTH),
  lineEnding: lineEndingSchema,
  hasBom: z.boolean(),
});

export const saveAsRequestSchema = z.object({
  suggestedName: labelSchema,
  documentPath: absolutePathSchema.nullish(),
  content: z.string().max(MAX_CONTENT_LENGTH),
  lineEnding: lineEndingSchema,
  hasBom: z.boolean(),
});

export const exportRequestSchema = z.object({
  suggestedName: labelSchema,
  documentPath: absolutePathSchema.nullish(),
  html: z.string().max(MAX_HTML_LENGTH),
});

export const sessionStateSchema = z.object({
  documents: z.array(z.object({ path: absolutePathSchema, mode: editorModeSchema })).max(500),
  activePath: absolutePathSchema.nullable(),
});

const sectionPatchSchema = z.record(z.string().max(64), z.unknown()).optional();

/**
 * Shape check of a settings patch. The values are validated by
 * `applySettingsPatch`, which knows the full settings schema.
 */
export const settingsPatchSchema = z.strictObject({
  appearance: sectionPatchSchema,
  rendering: sectionPatchSchema,
  editor: sectionPatchSchema,
  general: sectionPatchSchema,
});

/** Formats a zod error as a single human readable line. */
export function describeZodError(error: z.ZodError): string {
  return z.prettifyError(error).replace(/\s*\n\s*/g, '; ');
}
