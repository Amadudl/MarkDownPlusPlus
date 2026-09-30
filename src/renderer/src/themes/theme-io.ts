import { z } from 'zod';
import {
  codeThemeSchema,
  elementStyleSchema,
  uiThemeSchema,
  type CodeTheme,
  type ElementStyle,
  type UiTheme,
} from '@shared/theme-model';

/** Identifies MarkDown++ theme files. */
export const THEME_FILE_FORMAT = 'markdownplusplus-theme';
/** Version of the theme file envelope. */
export const THEME_FILE_VERSION = 1;
/** Theme files larger than this are rejected before parsing (256 KiB). */
export const MAX_THEME_FILE_LENGTH = 256 * 1024;

/** The layer a theme belongs to. */
export type ThemeLayer = 'ui' | 'code' | 'elements';

/** Result of a successful import. */
export type ThemeImport =
  | { readonly kind: 'ui'; readonly theme: UiTheme }
  | { readonly kind: 'code'; readonly theme: CodeTheme }
  | { readonly kind: 'elements'; readonly theme: ElementStyle };

const LAYER_LABEL: Readonly<Record<ThemeLayer, string>> = {
  ui: 'UI theme',
  code: 'code theme',
  elements: 'element style',
};

const envelopeSchema = z.object({
  format: z.literal(THEME_FILE_FORMAT),
  version: z.number().int().min(1),
  kind: z.enum(['ui', 'code', 'elements']),
  theme: z.unknown(),
});

/** Detects the layer of a theme object by its distinctive keys. */
export function detectThemeLayer(value: unknown): ThemeLayer | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if ('typography' in record) return 'elements';
  const colors = record.colors;
  if (typeof colors !== 'object' || colors === null) return null;
  if ('keyword' in colors) return 'code';
  if ('editorBackground' in colors) return 'ui';
  return null;
}

function describeIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.map(String).join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const more = error.issues.length > 5 ? ` (and ${error.issues.length - 5} more)` : '';
  return issues.join('; ') + more;
}

function validate(layer: ThemeLayer, theme: unknown): ThemeImport {
  const fail = (error: z.ZodError): never => {
    throw new Error(`Invalid ${LAYER_LABEL[layer]}: ${describeIssues(error)}`);
  };
  switch (layer) {
    case 'ui': {
      const parsed = uiThemeSchema.safeParse(theme);
      return parsed.success ? { kind: 'ui', theme: parsed.data } : fail(parsed.error);
    }
    case 'code': {
      const parsed = codeThemeSchema.safeParse(theme);
      return parsed.success ? { kind: 'code', theme: parsed.data } : fail(parsed.error);
    }
    case 'elements': {
      const parsed = elementStyleSchema.safeParse(theme);
      return parsed.success ? { kind: 'elements', theme: parsed.data } : fail(parsed.error);
    }
  }
}

/**
 * Parses an imported theme file. Accepts the export envelope written by
 * {@link serializeThemeExport} and, for convenience, a bare theme object.
 * @throws Error with a readable, user-facing message when the file is not a valid theme.
 */
export function parseThemeImport(json: string): ThemeImport {
  if (json.length > MAX_THEME_FILE_LENGTH) {
    throw new Error('The theme file is too large (maximum 256 KB).');
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('The theme file is not valid JSON.');
  }
  const envelope = envelopeSchema.safeParse(data);
  if (envelope.success) {
    if (envelope.data.version > THEME_FILE_VERSION) {
      throw new Error('The theme file was created by a newer version of MarkDown++.');
    }
    return validate(envelope.data.kind, envelope.data.theme);
  }
  if (typeof data === 'object' && data !== null && 'format' in data) {
    throw new Error(`Invalid theme file: ${describeIssues(envelope.error)}`);
  }
  const layer = detectThemeLayer(data);
  if (!layer) throw new Error('The file does not contain a MarkDown++ theme.');
  return validate(layer, data);
}

/** Serialises a theme to a pretty-printed, versioned JSON theme file. */
export function serializeThemeExport(theme: UiTheme | CodeTheme | ElementStyle): string {
  const kind = detectThemeLayer(theme);
  if (!kind) throw new Error('Unsupported theme object.');
  return `${JSON.stringify({ format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, kind, theme }, null, 2)}\n`;
}
