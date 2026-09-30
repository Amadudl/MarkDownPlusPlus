# AGENTS.md

Rules for AI coding agents (Claude Code, Codex, Copilot, Cursor, …) working on this
repository. Humans are welcome to read along — the same rules apply to everyone; see also
[CONTRIBUTING.md](CONTRIBUTING.md). These rules are **mandatory**.

## Project overview

MarkDown++ is a cross-platform (macOS, Windows, Linux) Electron desktop editor for
Markdown files. Its focus is best-in-class **Visual mode (WYSIWYG)** editing with a
one-click switch to **Markdown mode (source)**, fully customisable theming (UI themes,
code themes, element styles) and a hardened security model. The repository is public and
must stay at senior-level quality.

| Area       | Technology                                                                            |
| ---------- | ------------------------------------------------------------------------------------- |
| Shell      | Electron 44 (main, sandboxed preload, renderer)                                       |
| UI         | React 19, zustand 5, lucide-react icons, Inter / JetBrains Mono (bundled)             |
| Editors    | Milkdown Crepe 7 (Visual mode), CodeMirror 6 (Markdown mode)                          |
| Markdown   | unified / remark / rehype, KaTeX, DOMPurify                                           |
| Validation | zod 4                                                                                 |
| Tooling    | TypeScript 6 (strict), Vite 8, ESLint (typescript-eslint strictTypeChecked), Prettier |
| Tests      | Vitest 5 + Testing Library (unit, ≥ 95 % coverage), Playwright `_electron` (E2E)      |
| Packaging  | electron-builder (`electron-builder.yml`)                                             |

Read [docs/architecture.md](docs/architecture.md) before changing anything non-trivial.

## Architecture boundaries

```
src/shared    ← imported by everyone; pure TypeScript, no Node and no DOM APIs
src/main      ← Node + Electron main process; the only layer with file system access
src/preload   ← sandboxed bridge; exposes window.mpp (MppApi) and nothing else
src/renderer  ← React app; no Node, talks to main only through window.mpp
```

1. **`src/shared` stays free of Node and DOM APIs** (no `fs`, `path`, `electron`,
   `window`, `document`). It holds the contract: `ipc.ts`, `types.ts`, `commands.ts`,
   `shortcuts.ts`, `settings.ts`, `theme-model.ts`, `file-url.ts`.
2. **The renderer reaches the main process only through `window.mpp`**, accessed via
   `getApi()` in `src/renderer/src/platform/api.ts` — the only module that touches the
   global. Never import `electron` in the renderer.
3. **IPC channels are defined only in `src/shared/ipc.ts`.** Never use string literals
   for channel names. Every renderer → main channel has a zod argument schema in the main
   process and is validated (including the sender frame) before any service runs.
4. **The Markdown string is the single source of truth** of a document. Editors implement
   the `EditorAdapter` contract (`src/renderer/src/editor/types.ts`); the shell talks to
   editors only through it.
5. **Themes are data.** They are validated by the schemas in `src/shared/theme-model.ts`
   and applied as CSS custom properties by the theme engine. Themes never contain CSS or
   code.
6. **Commands are defined once.** Menu, toolbar, palette and shortcuts refer to
   `CommandId` values; behaviour lives in `src/renderer/src/commands/`.

## Commands to run before finishing

Run all of these and make sure they pass **without warnings**:

```bash
npm run lint           # ESLint, --max-warnings 0
npm run format:check   # Prettier (fix with: npm run format)
npm run typecheck      # tsc for tsconfig.node.json and tsconfig.web.json
npm run test:coverage  # Vitest; ≥ 95 % lines, branches, functions, statements
npm run test:e2e       # builds the app and runs Playwright against Electron
```

`npm run verify` runs all five in sequence. On headless Linux use
`xvfb-run -a npm run test:e2e`. The E2E suite runs its windows in background mode
(`MPP_E2E_BACKGROUND=1`, set by `playwright.config.ts`: invisible, click-through, never
focused), so a developer can keep working on the same machine. When you launch the app
yourself (screenshots, manual checks), also pass a fresh `MPP_USER_DATA_DIR` and
`MPP_E2E_BACKGROUND=1`, and always terminate the process afterwards. In E2E tests press
application shortcuts with `pressShortcut()` from `tests/e2e/fixtures.ts`
(`webContents.sendInputEvent`); `page.keyboard` bypasses the main-process shortcut
routing. Report the actual results (numbers) in your summary —
never claim success without running them.

## Conventions

- **Strict TypeScript.** No `any`, no non-null assertions (`!`) in production code, no
  `@ts-ignore` / `@ts-expect-error`, no `eslint-disable` without a written justification
  on the same line. `noUncheckedIndexedAccess` is on — handle `undefined`.
- **`import type`** for type-only imports (`verbatimModuleSyntax`).
- **JSDoc** on every exported function, class, type and constant.
- **Small, cohesive modules** with descriptive names; match the style of neighbouring
  files (single quotes, semicolons, 2-space indent, print width 110).
- **Colocated unit tests** (`foo.ts` → `foo.test.ts`) that exercise real behaviour.
  Coverage ≥ 95 % for lines **and** branches on every file you touch.
- **E2E tests for every UI change** in `tests/e2e/`, driving the real rendered interface.
- **Real code only.** No stubs, placeholders, `TODO`s, mock return values in production
  code, or "not implemented" branches. If something cannot be implemented, stop and
  report the blocker.
- **No `console.log`.** `console.warn` / `console.error` only for genuine diagnostics.
- **Docs are part of the change** (see [Definition of done](#definition-of-done)).
- Use the terms **Visual mode (WYSIWYG)** and **Markdown mode (source)** consistently in
  UI text and docs.

## Security rules

- Validate **all** input crossing a trust boundary with zod: IPC arguments (main),
  persisted JSON (settings, session, recent files), imported theme files.
- File paths over IPC must be absolute and free of NUL bytes. Writes are only allowed to
  paths registered by a user action (open/save dialog, opened file, restored session).
- **Never inject unsanitised HTML.** No `dangerouslySetInnerHTML`, `innerHTML` or
  `insertAdjacentHTML` with content that did not pass DOMPurify. Raw HTML in Markdown is
  never executed.
- **Never** use `eval`, `new Function`, string `setTimeout`, or anything that requires
  `unsafe-eval` / `unsafe-inline` scripts in the CSP.
- External URLs open only through the main process allowlist (`https:`, `http:`,
  `mailto:`). The renderer never navigates away from the app.
- Local files are exposed to the renderer only through `mpp-file:` (image extensions
  only). Do not widen it.
- No secrets, tokens or personal data in code, tests, fixtures or logs.
- Least privilege for CI: workflows default to `permissions: contents: read`.

## Forbidden actions

Do **not**:

- disable or weaken `sandbox`, `contextIsolation`, `webSecurity`, the CSP, the Electron
  fuses, or enable `nodeIntegration`, `webviewTag`, `allowRunningInsecureContent`, or
  `--no-sandbox`;
- add `unsafe-eval` or `unsafe-inline` for scripts;
- expose `ipcRenderer`, Node APIs or Electron objects to the page;
- add IPC channels outside `src/shared/ipc.ts` or handlers without zod validation;
- inject raw HTML;
- add, remove or upgrade dependencies without a written justification (maintenance,
  security, size, license) — prefer existing dependencies or a small amount of code;
- lower coverage thresholds, add coverage exclusions, skip or `.only` tests, or delete
  failing tests to make a build pass;
- silence warnings instead of fixing them;
- rename or remove released theme ids, setting keys or command ids (they are persisted);
- modify `LICENSE`, or describe the project as "open source" (it is source-available,
  non-commercial);
- commit generated output (`out/`, `release/`, `coverage/`, reports) or local files.

## Definition of done

A change is done only when **all** of the following are true:

1. The code is complete and real — no placeholders.
2. `lint`, `format:check`, `typecheck`, `test:coverage` (≥ 95 %) and `test:e2e` pass, with
   no warnings in their output or in the app's runtime logs.
3. New or changed behaviour has unit tests; UI changes have E2E tests.
4. Documentation matches the code: user guide, settings reference, shortcuts, theming,
   architecture, in-app help text, JSDoc.
5. `CHANGELOG.md` has an entry under **Unreleased** for user-visible changes.
6. Security implications were considered; any vulnerability found in existing code is
   reported.
7. The final summary lists what was done, real build/test/coverage numbers, security
   findings and clearly marked open items.

## How to add a command

1. Add an id to `CommandId` in `src/shared/commands.ts` (`area.verbNoun`, e.g.
   `view.toggleMinimap`). Ids are persisted in menus and tests — never rename released ids.
2. Optional: add a default shortcut to `SHORTCUTS` in `src/shared/shortcuts.ts`
   (Electron accelerator syntax, `CmdOrCtrl+…`). Check for conflicts with existing
   shortcuts, with the editors' built-in keymaps and with the menu role accelerators in
   `ROLE_ACCELERATORS` (`src/main/keyboard.ts`) — a shortcut that equals a role
   accelerator is never routed. If only macOS collides (e.g. `⌘H` = Hide), add a macOS
   replacement to `MAC_SHORTCUT_OVERRIDES`. Everything that reads shortcuts (menu,
   keyboard router, renderer labels, CodeMirror keymap filter) resolves them per platform
   with `shortcutsFor(platform)` / `shortcutFor(id, platform)`; never read `SHORTCUTS`
   directly.
3. Implement the behaviour in `src/renderer/src/commands/` and register it in the `SPECS`
   record in `definitions.ts` (label, category, `run`). The record is typed over all
   command ids, so the compiler tells you if one is missing.
4. Add a menu item in `src/main/menu.ts` if the command belongs in the native menu.
5. Tests: unit tests for the command logic and the definition; an E2E test that runs the
   command from the palette or menu and checks the visible result.
6. Docs: [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) (mirrors
   `shortcuts.ts` 1:1) and the [user guide](docs/user-guide.md).

## How to add a setting

1. Add the field with a `.default(…)` and tight constraints (`min`, `max`, `enum`) to the
   right section schema in `src/shared/settings.ts`, with a JSDoc comment.
2. Defaults must keep existing settings files valid. If the persisted shape changes
   incompatibly, increment `SETTINGS_VERSION` and add a migration with tests; parsing must
   stay tolerant (a damaged section falls back to defaults).
3. Extend `src/shared/settings.test.ts` (defaults, validation, patching).
4. Add the control to the settings dialog in `src/renderer/src/components/settings/`
   with a label and help text, and consume the value through the settings store.
5. Add an E2E test that changes the setting and verifies its effect (and persistence
   across a restart when relevant).
6. Document it in the [settings reference](docs/user-guide.md#settings-reference).

## How to add a theme preset

Follow [Adding a theme preset](CONTRIBUTING.md#adding-a-theme-preset): add a typed
constant to the right file in `src/renderer/src/themes/presets/`, append it to the
exported list, pair UI themes with a code theme in `code-pairing.ts`, keep WCAG AA
contrast, credit the original palette, and update [docs/theming.md](docs/theming.md),
the README counts and the changelog.

## How to add an IPC channel

1. Add the channel name to `IpcChannel` in `src/shared/ipc.ts` (`area:verb-noun`).
2. Add the method (and any DTOs) to `MppApi` in `src/shared/types.ts`, with JSDoc.
3. Main process: add a zod argument schema to `ipcArgumentSchemas` in `src/main/ipc.ts`
   (reuse or add validators in `src/main/validation.ts`) and register the handler. It must
   check the sender frame, validate arguments, and delegate to a service in
   `src/main/services/`. Never trust renderer input; return plain, serialisable data.
4. Preload: forward the call in `src/preload/createApi.ts` using the `IpcChannel`
   constant. Event subscriptions return an `Unsubscribe` and never leak the
   `IpcRendererEvent` to the page.
5. Renderer: call it through `getApi()`.
6. Tests: validation (valid and invalid input, untrusted sender), the service, the
   preload forwarding, and the renderer usage. E2E if the feature is user-facing.
7. Update the shared-contract table in [docs/architecture.md](docs/architecture.md) and
   the [security model](SECURITY.md#security-model) if the channel touches files, the
   network or the OS.
