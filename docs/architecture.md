# Architecture

MarkDown++ is an Electron application written in strict TypeScript. It is split
into three isolated layers that communicate only through a typed, validated IPC
contract.

```
┌──────────────────────────── Main process (Node) ────────────────────────────┐
│ src/main      window lifecycle · application menu · file I/O · settings    │
│               store · recent files · session · file watching · export      │
│               custom protocols · security hardening                        │
└───────────────▲─────────────────────────────────────────────▲──────────────┘
                │ ipcRenderer.invoke / webContents.send       │
┌───────────────┴──── Preload (sandboxed, contextBridge) ─────┴──────────────┐
│ src/preload   exposes `window.mpp` implementing `MppApi` (src/shared)       │
└───────────────▲────────────────────────────────────────────────────────────┘
                │ window.mpp
┌───────────────┴──────────────── Renderer (Chromium) ───────────────────────┐
│ src/renderer  React 19 shell · zustand stores · command registry           │
│               editors (Milkdown Crepe = WYSIWYG, CodeMirror 6 = source)    │
│               theme engine (UI schemes, code themes, element styles)       │
│               HTML/PDF/PNG export pipeline                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

## Shared contract (`src/shared`)

| File             | Purpose                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `ipc.ts`         | Every IPC channel name. Never use string literals for channels.                  |
| `ipc-result.ts`  | `IpcResult` envelope (`ok` + `value`, or `code` + `message`) of invoke channels. |
| `types.ts`       | `MppApi` (the `window.mpp` surface) and all DTOs crossing the process boundary.  |
| `commands.ts`    | Stable command ids shared by menu, palette, toolbar and shortcuts.               |
| `shortcuts.ts`   | Default shortcuts (`SHORTCUTS`), macOS overrides and `shortcutsFor(platform)`.   |
| `file-url.ts`    | `mpp-file:` URL conversion and `resolveImageSrc` (remote-image policy).          |
| `settings.ts`    | zod schema, defaults, tolerant parsing and patching of persisted settings.       |
| `theme-model.ts` | zod schemas of UI themes, code themes and element styles (user-editable data).   |

`src/shared` must stay free of Node and DOM APIs so it can be imported by all layers.

## Main process (`src/main`)

- `index.ts` — bootstrap only: single-instance lock, protocol registration, window creation.
- `window.ts` — `BrowserWindow` factory with hardened `webPreferences`
  (`contextIsolation`, `sandbox`, no `nodeIntegration`, no `webviewTag`), window state
  persistence, navigation/new-window blocking, close handshake with the renderer.
- `security.ts` — CSP headers, permission request denial, navigation guards, URL allowlist
  for `shell.openExternal` (`https:`, `http:`, `mailto:` only; `mailto:` URLs keep only
  recipients and `to`/`cc`/`bcc`/`subject`/`body`, see `safeExternalUrl`).
- `protocol.ts` — `mpp-app://` serves the bundled renderer (instead of `file://`);
  `mpp-file://` serves **image files only** (by extension allowlist, at most 50 MB) so
  documents can show relative/local images without granting the renderer general file
  access. It is not limited to the document's folder: any such image file on a local
  disk can be served. On Windows, network (UNC) paths are only served for servers that
  host a granted file, and device paths (`\\?\…`, `\\.\…`) never, so a document cannot
  make the app send NTLM credentials to an arbitrary server.
- `ipc.ts` — registers every handler; each handler validates the sender frame and its
  arguments with zod before calling a service. Invoke handlers resolve with an
  `IpcResult` (`src/shared/ipc-result.ts`): expected failures (invalid arguments, refused
  paths, `ENOENT`, `EACCES`, …) become `{ ok: false, code, message }` via
  `ipcErrors.ts` instead of a rejection, so the main-process log stays clean and the
  error code survives; the preload unwraps it into a rejected promise with a
  user-facing message. Only unexpected errors are logged (`console.error`).
- `services/*` — pure(ish), unit-tested services: `fileService` (UTF-8-only read with
  BOM/EOL detection; refuses write-protected targets; atomic write via temp file +
  rename, falling back to an in-place write for hard-linked or foreign-owned files, folders
  without create permission and — after retrying — locked files on Windows), `settingsStore`, `recentFiles`, `sessionStore`,
  `fileWatcher`, `exporter` (PDF via `printToPDF` and PNG via `imageCapture` — DevTools
  protocol screenshots in tiles of at most 8192 device pixels, stitched losslessly — both
  in a hidden (`show: false`), sandboxed, JavaScript-disabled `BrowserWindow` on a
  locked-down session).
- `menu.ts` — native application menu; every item sends a `CommandId` to the renderer.
- `keyboard.ts` — deterministic shortcut routing: every key press of an app window is
  matched against the platform's shortcut table (`shortcutsFor(platform)`, i.e.
  `SHORTCUTS` plus `MAC_SHORTCUT_OVERRIDES` on macOS) in `before-input-event`; a match
  is swallowed (so neither
  the page's editor keymaps nor the menu accelerator also handle it) and its command is
  sent to that window. Standard role shortcuts (copy, paste, quit, hide, …) are left to
  the menu. Key presses injected through the DevTools protocol (Playwright
  `page.keyboard`) bypass `before-input-event`; E2E tests use
  `webContents.sendInputEvent` for shortcuts.
- Close handshake (`window.ts`): a close is prevented and `CloseRequested` is sent; the
  renderer answers `CloseReady` or `CloseCancelled`. Asking about unsaved changes
  disarms the 5 s force-close timeout; an unresponsive or crashed renderer is
  force-closed. On macOS a cancelled close also cancels a pending quit.
- Paths: `userData` can be overridden with `MPP_USER_DATA_DIR` (used by E2E tests).
  Portable builds store data in a `MarkDownPlusPlus-data` folder next to the executable
  (always for the Windows portable build via `PORTABLE_EXECUTABLE_DIR`; on other builds
  when that folder exists beside the executable or the AppImage). See `src/main/paths.ts`.

## Preload (`src/preload`)

A single sandboxed CommonJS bundle. It only forwards calls to `ipcRenderer` and wraps
event subscriptions so listeners never receive the raw `IpcRendererEvent`.

## Renderer (`src/renderer/src`)

| Folder        | Responsibility                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform/`   | `getApi()` accessor for `window.mpp` (the only place touching the global).                                                                                                                                                                                                     |
| `store/`      | zustand stores: `documents` (tabs, content, dirty state), `settings`, `ui`.                                                                                                                                                                                                    |
| `commands/`   | Command registry and definitions (`CommandId` → handler, label, shortcut label), document, view and session actions, autosave, file watching, window sync and the fuzzy search of the palette. Key presses are matched in the main process (`src/main/keyboard.ts`), not here. |
| `editor/`     | `EditorAdapter` contract (`types.ts`), Crepe adapter, CodeMirror adapter, search, `EditorHost` React component.                                                                                                                                                                |
| `themes/`     | Built-in presets, theme resolution, CSS variable application, CodeMirror theme.                                                                                                                                                                                                |
| `export/`     | Markdown → sanitised, self-contained HTML (used for HTML, PDF and PNG export).                                                                                                                                                                                                 |
| `components/` | React UI: app shell, title bar with the tabs and the Visual/Markdown switch, toolbar, status bar, settings, command palette, outline, find bar, dialogs.                                                                                                                       |
| `styles/`     | Global styles, design tokens, element-style variants.                                                                                                                                                                                                                          |

### Documents and the mode switch

The markdown **string** is the single source of truth of a document. Each open tab owns
exactly one `EditorAdapter`. Switching between WYSIWYG and source serialises the current
editor with `getMarkdown()`, destroys it and mounts the other editor with that markdown.
Line endings and BOM of the file on disk are tracked separately and restored on save.

### Theming

Three independent, JSON-serialisable layers (schemas in `src/shared/theme-model.ts`):

1. **UI theme** — colours of the chrome and the editor surface.
2. **Code theme** — syntax colours for code blocks and the source editor.
3. **Element style** — typography and the look of each markdown element
   (headings, quotes, code blocks, inline code, tables, lists, links, rules, images).

`themes/engine.ts` resolves the active trio from the settings, converts each key to a CSS
custom property (`uiTheme.colors.surfaceElevated` → `--mpp-ui-surface-elevated`,
`codeTheme.colors.controlKeyword` → `--mpp-code-control-keyword`, element style values →
`--mpp-el-*`) and sets data attributes for variants on the document root
(e.g. `data-mpp-quote="card"`). All element CSS targets the `.mpp-document` container, which
wraps both the live WYSIWYG editor and exported HTML, so the export looks like the editor.

## Security model

- Renderer is sandboxed, context-isolated and has no Node access.
- Strict CSP: `default-src 'self'`; `script-src 'self'`; no `unsafe-eval`; images only from
  `'self' data: blob: mpp-file: https:`. `https:` is **always** part of the CSP; the
  _Load remote images_ setting (`rendering.loadRemoteImages`, off by default) is enforced
  in app logic by `resolveImageSrc` (`src/shared/file-url.ts`), which drops remote image
  URLs from the editor and the export when the setting is off, and in the main process
  by `installRemoteImageGuard` (`src/main/remoteImages.ts`), which cancels remote image
  requests of the app session while it is off (read per request, so a change applies
  without a reload).
- All IPC input is validated in the main process, and file paths must be absolute.
- File access (`FileService`, `PathRegistry`, `SessionStore`, enforced in the main
  process): **reading, writing, watching and reveal-in-folder all require a granted path**,
  whatever its extension. Reads accept UTF-8 text only (binary, UTF-16 and other
  non-UTF-8 files are refused) up to 50 MB.
  - **Grants** come only from user actions and main-process state: a path picked in the
    open or save dialog; a file the OS asks the app to open (command line, second
    instance, macOS `open-file`); a dropped file (`FileGrantDropped`: the path comes from
    the preload's `webUtils.getPathForFile` for a real dropped `File`, and is granted
    only if its target after resolving symlinks is an existing Markdown/text file); the
    entries of the recent-files list (written only by the main process after a granted
    file was opened or saved); and the documents of the session file **as it was found
    at startup**, before any renderer existed (`captureStartupSession`).
  - The session file cannot grant anything new: `SessionSave` keeps only already granted
    paths, and `SessionLoad` grants only documents recorded at startup.
  - Limits: grants last for the whole run and are shared by all windows, so a
    compromised renderer can read and overwrite any file granted during that run (but no
    other file).
- Raw HTML inside markdown is never executed; exported HTML is sanitised with DOMPurify.
- External links open in the OS browser only for allowlisted schemes.

## Further reading

- [SECURITY.md](../SECURITY.md) — the complete security model and how to report issues.
- [theming.md](theming.md) — theme layers, presets and the theme JSON format.
- [development.md](development.md) — dev loop, debugging, testing and packaging.
- [AGENTS.md](../AGENTS.md) — step-by-step guides for adding commands, settings, presets
  and IPC channels.
