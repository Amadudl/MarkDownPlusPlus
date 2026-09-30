import { z } from 'zod';
import { codeThemeSchema, elementStyleSchema, uiThemeSchema } from './theme-model';

/** Increment when the persisted shape changes incompatibly and add a migration. */
export const SETTINGS_VERSION = 1;

export const appearanceSettingsSchema = z.object({
  /** Id of the active UI colour scheme (built-in or custom). */
  uiTheme: z.string().min(1).max(64).default('midnight'),
  /** When true the app switches between `lightTheme` and `darkTheme` following the OS. */
  followSystem: z.boolean().default(true),
  lightTheme: z.string().min(1).max(64).default('daylight'),
  darkTheme: z.string().min(1).max(64).default('midnight'),
  customUiThemes: z.array(uiThemeSchema).max(100).default([]),
  /** Zoom factor of the whole window (0.5 - 3). */
  zoom: z.number().min(0.5).max(3).default(1),
});

export const renderingSettingsSchema = z.object({
  codeTheme: z.string().min(1).max(64).default('auto'),
  customCodeThemes: z.array(codeThemeSchema).max(100).default([]),
  elementStyle: z.string().min(1).max(64).default('modern'),
  customElementStyles: z.array(elementStyleSchema).max(100).default([]),
  /**
   * Allow `https:` images in documents. Off by default: loading them would tell
   * the sender when and from where a document was opened (tracking pixels).
   * Local images are always allowed.
   */
  loadRemoteImages: z.boolean().default(false),
});

export const editorSettingsSchema = z.object({
  defaultMode: z.enum(['wysiwyg', 'source']).default('wysiwyg'),
  sourceFontFamily: z
    .string()
    .min(1)
    .max(300)
    .default(
      "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace",
    ),
  sourceFontSize: z.number().min(8).max(40).default(14),
  sourceLineNumbers: z.boolean().default(true),
  wordWrap: z.boolean().default(true),
  spellcheck: z.boolean().default(true),
  tabSize: z.number().int().min(1).max(8).default(2),
  autoSave: z.enum(['off', 'afterDelay', 'onFocusChange']).default('off'),
  autoSaveDelayMs: z.number().int().min(500).max(60_000).default(1500),
  restoreSession: z.boolean().default(true),
  newLineEnding: z.enum(['lf', 'crlf', 'system']).default('system'),
});

export const generalSettingsSchema = z.object({
  confirmOnClose: z.boolean().default(true),
  showWelcome: z.boolean().default(true),
  showOutline: z.boolean().default(false),
  showStatusBar: z.boolean().default(true),
});

export const settingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION).default(SETTINGS_VERSION),
  appearance: appearanceSettingsSchema.prefault({}),
  rendering: renderingSettingsSchema.prefault({}),
  editor: editorSettingsSchema.prefault({}),
  general: generalSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type AppearanceSettings = Settings['appearance'];
export type RenderingSettings = Settings['rendering'];
export type EditorSettings = Settings['editor'];
export type GeneralSettings = Settings['general'];

/** A partial update: each section may be partially specified. */
export type SettingsPatch = {
  readonly [K in Exclude<keyof Settings, 'version'>]?: Partial<Settings[K]>;
};

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type FieldResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function parseField(schema: z.ZodType, value: unknown): FieldResult {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  if (!Array.isArray(value)) return { ok: false };
  // Keep the valid entries of a list (e.g. custom themes) instead of dropping them all.
  const kept: unknown[] = value.filter((item: unknown) => schema.safeParse([item]).success);
  const retry = schema.safeParse(kept);
  return retry.success ? { ok: true, value: retry.data } : { ok: false };
}

function parseSection<T extends object>(schema: z.ZodObject, value: unknown, fallback: T): T {
  const whole = schema.safeParse(value ?? {});
  if (whole.success) return whole.data as T;
  const source = isRecord(value) ? value : {};
  const defaults = fallback as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const field = parseField(fieldSchema as z.ZodType, source[key]);
    result[key] = field.ok ? field.value : defaults[key];
  }
  return result as T;
}

/**
 * Parses untrusted persisted data. Invalid values fall back to their defaults
 * field by field (invalid entries of lists such as custom themes are dropped)
 * instead of throwing, so a corrupt settings file can never brick the
 * application or wipe unrelated preferences.
 */
export function parseSettings(raw: unknown): Settings {
  const full = settingsSchema.safeParse(raw);
  if (full.success) return full.data;
  const source = isRecord(raw) ? raw : {};
  return {
    version: SETTINGS_VERSION,
    appearance: parseSection(appearanceSettingsSchema, source.appearance, DEFAULT_SETTINGS.appearance),
    rendering: parseSection(renderingSettingsSchema, source.rendering, DEFAULT_SETTINGS.rendering),
    editor: parseSection(editorSettingsSchema, source.editor, DEFAULT_SETTINGS.editor),
    general: parseSection(generalSettingsSchema, source.general, DEFAULT_SETTINGS.general),
  };
}

/** Applies a patch and validates the result; throws a ZodError on invalid input. */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  return settingsSchema.parse({
    version: SETTINGS_VERSION,
    appearance: { ...current.appearance, ...patch.appearance },
    rendering: { ...current.rendering, ...patch.rendering },
    editor: { ...current.editor, ...patch.editor },
    general: { ...current.general, ...patch.general },
  });
}
