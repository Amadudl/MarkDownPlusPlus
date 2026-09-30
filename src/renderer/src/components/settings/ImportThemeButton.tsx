import { useRef, type JSX } from 'react';
import { Upload } from 'lucide-react';
import { toastError, useUi } from '@renderer/store/ui';
import { importTheme } from './themeActions';

const KIND_LABEL = { ui: 'Colour scheme', code: 'Code theme', elements: 'Element style' } as const;

/** Largest accepted theme file (themes are small JSON documents). */
export const MAX_THEME_FILE_BYTES = 256 * 1024;

/** Reads a theme JSON file chosen by the user and imports it. */
export async function importThemeFile(file: File): Promise<boolean> {
  if (file.size > MAX_THEME_FILE_BYTES) {
    useUi
      .getState()
      .pushToast('error', 'Theme file is too large.', { detail: `${file.name} exceeds 256 KB.` });
    return false;
  }
  try {
    const result = await importTheme(await file.text());
    useUi.getState().pushToast('success', `${KIND_LABEL[result.kind]} “${result.theme.name}” imported.`);
    return true;
  } catch (error) {
    toastError(`Could not import ${file.name}`, error);
    return false;
  }
}

/** Button that opens a file picker for theme JSON files of any kind. */
export function ImportThemeButton(): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="button" onClick={() => input.current?.click()}>
        <Upload size={14} aria-hidden="true" /> Import JSON…
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Theme file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void importThemeFile(file);
        }}
      />
    </>
  );
}
