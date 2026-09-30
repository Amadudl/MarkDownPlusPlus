# Development

This guide covers everything you need to work on MarkDown++: setting up, the dev loop,
debugging, testing, code quality tools, icons and local packaging. Read
[architecture.md](architecture.md) first for the big picture, and
[CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow and rules.

- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [npm scripts](#npm-scripts)
- [Project layout](#project-layout)
- [Dev loop](#dev-loop)
- [Debugging](#debugging)
- [Testing](#testing)
- [Linting, formatting and type-checking](#linting-formatting-and-type-checking)
- [Generating icons](#generating-icons)
- [Packaging locally](#packaging-locally)
- [Toolchain notes](#toolchain-notes)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| Tool    | Version                                                  | Notes                                                    |
| ------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Node.js | **22.12 or newer** (exact version in `.nvmrc`)           | `nvm use` / `fnm use` picks it up automatically.         |
| npm     | the version bundled with Node                            | Always use `npm ci` so `package-lock.json` is respected. |
| Git     | any recent version                                       |                                                          |
| Linux   | `xvfb` for headless E2E tests, `rpm` for `.rpm` packages | `sudo apt install xvfb rpm`                              |

Recommended editor: VS Code with the extensions in `.vscode/extensions.json` (ESLint,
Prettier, Vitest, Playwright). The workspace settings format on save with Prettier and
use the ESLint flat config.

## Getting started

```bash
git clone https://github.com/Amadudl/MarkDownPlusPlus.git
cd MarkDownPlusPlus
npm ci
npm run dev
```

`npm ci` also downloads the Electron binary. Do not add or upgrade dependencies casually —
see [dependency policy](../CONTRIBUTING.md#dependencies).

## npm scripts

| Script                                    | What it does                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                             | Starts the Vite dev server for the renderer (with HMR), builds main and preload in watch mode and (re)launches Electron. |
| `npm run build`                           | Type-checks, then builds all three bundles into `out/`.                                                                  |
| `npm run build:app`                       | Builds `out/main`, `out/preload` and `out/renderer` without type-checking.                                               |
| `npm start`                               | Runs the last build from `out/` with Electron.                                                                           |
| `npm run typecheck`                       | `tsc --noEmit` for the Node side (`tsconfig.node.json`) and the web side (`tsconfig.web.json`).                          |
| `npm run lint`                            | ESLint (type-aware, `strictTypeChecked`) with `--max-warnings 0`.                                                        |
| `npm run format`                          | Formats the repository with Prettier.                                                                                    |
| `npm run format:check`                    | Fails if any file is not formatted.                                                                                      |
| `npm test`                                | Runs all unit tests once (Vitest).                                                                                       |
| `npm run test:watch`                      | Vitest in watch mode.                                                                                                    |
| `npm run test:coverage`                   | Unit tests with V8 coverage; fails below **95 %** lines, branches, functions or statements.                              |
| `npm run test:e2e`                        | Builds the app and runs the Playwright end-to-end tests against the real Electron app.                                   |
| `npm run verify`                          | Everything CI checks: lint, format check, type-check, coverage, E2E. Run it before opening a PR.                         |
| `npm run package`                         | Builds and packages installers and portable builds for the current OS into `release/`.                                   |
| `npm run package:mac` / `:win` / `:linux` | Packages for one platform.                                                                                               |
| `npm run icons`                           | Regenerates `build/icon.png` and `build/icons/*.png` from `build/icon.svg` (see [Generating icons](#generating-icons)).  |

## Project layout

```
.
├── build/                  icon.svg (source), generated PNG icons, macOS entitlements
├── docs/                   user and developer documentation
├── scripts/
│   ├── dev.mjs             development runner (Vite + Electron)
│   └── generate-icons.mjs  rasterises build/icon.svg with Electron
├── src/
│   ├── shared/             contract shared by all processes (no Node/DOM APIs)
│   │   ├── ipc.ts          IPC channel names
│   │   ├── types.ts        MppApi (window.mpp) and DTOs
│   │   ├── commands.ts     command ids
│   │   ├── shortcuts.ts    keyboard shortcuts
│   │   ├── settings.ts     settings schema, defaults, parsing, patching
│   │   ├── theme-model.ts  theme schemas
│   │   └── file-url.ts     mpp-file: URLs and image path resolution
│   ├── main/               Electron main process (window, menu, IPC, services, security)
│   ├── preload/            sandboxed preload exposing window.mpp
│   └── renderer/
│       ├── index.html
│       └── src/            React app: components, stores, commands, editors, themes, export
├── tests/e2e/              Playwright end-to-end tests (Electron)
├── electron-builder.yml    packaging configuration
└── vite.*.config.ts        one Vite config per bundle
```

Unit tests are **colocated** with the code they test (`foo.ts` → `foo.test.ts`).

Path aliases: `@shared/*` → `src/shared/*` and `@renderer/*` → `src/renderer/src/*`.

## Dev loop

`npm run dev` runs [`scripts/dev.mjs`](../scripts/dev.mjs):

1. starts the Vite dev server for the renderer (React Fast Refresh for UI changes);
2. builds `src/main` and `src/preload` in watch mode;
3. launches Electron with `MPP_DEV_SERVER_URL` pointing at the dev server, and relaunches
   it whenever the main or preload bundle is rebuilt.

Closing the window stops the dev runner.

Useful environment variables:

| Variable                    | Effect                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `MPP_USER_DATA_DIR`         | Absolute path used as the data directory instead of the per-user default. Handy to test with a clean profile (the E2E tests use it). |
| `MPP_DEV_SERVER_URL`        | Set by the dev runner; ignored in packaged builds.                                                                                   |
| `ELECTRON_ENABLE_LOGGING=1` | Prints Chromium logs to the terminal.                                                                                                |

Example with a throw-away profile:

```bash
MPP_USER_DATA_DIR="$(mktemp -d)" npm run dev
```

## Debugging

### Renderer

DevTools are available in development builds only: **View → Toggle Developer Tools**
(`⌥⌘I` on macOS, `Ctrl+Shift+I` elsewhere). React state lives in zustand stores under
`src/renderer/src/store/`.

### Main process

Build once and start Electron with the inspector enabled:

```bash
npm run build:app
npx electron --inspect=9229 .
```

Then open `chrome://inspect` in Chrome (or use VS Code's _Attach to Node Process_) and
attach to port 9229. Use `--inspect-brk` to stop on the first line. Packaged builds
disable the inspector through Electron fuses.

### Preload

Preload output appears in the renderer's DevTools console. The preload is sandboxed, so
only `electron`'s `contextBridge`/`ipcRenderer`/`webUtils` are available.

## Testing

MarkDown++ has two test layers. Both are mandatory.

### Unit tests (Vitest)

- Colocated `*.test.ts` / `*.test.tsx` files.
- Two Vitest projects (see `vitest.config.ts`):
  - **node** — `src/main`, `src/preload` and `src/shared`, Node environment. Electron
    modules are mocked with `vi.mock('electron', …)`.
  - **renderer** — `src/renderer`, jsdom environment with
    [Testing Library](https://testing-library.com/) and `jest-dom` matchers
    (`src/renderer/src/test/setup.ts`). CSS is not processed.
- Test behaviour, not implementation details. Query the DOM by role and label, use
  `@testing-library/user-event` for interaction.

```bash
npm test                                   # all tests
npx vitest run src/shared                  # one folder
npx vitest --project renderer              # one project, watch mode
```

### Coverage

```bash
npm run test:coverage
```

Coverage uses V8 and fails below **95 %** for lines, branches, functions and statements
across `src/**`. Reports are written to `coverage/` (`coverage/index.html` for the HTML
report, `lcov.info` for tools). To check only the files you are working on:

```bash
npx vitest run --coverage --coverage.include='src/renderer/src/export/**' src/renderer/src/export
```

### End-to-end tests (Playwright)

The E2E tests in `tests/e2e/` launch the **real, built** Electron app through Playwright's
`_electron` API, each with a fresh `MPP_USER_DATA_DIR`, and drive the rendered UI: typing
in Visual and Markdown mode, switching modes, tabs, find & replace, settings and themes,
saving files and more.

```bash
npm run test:e2e                     # builds the app, then runs all E2E tests
npx playwright test --grep "mode"    # after a build: run a subset
npx playwright show-report           # open the last HTML report
```

On Linux without a display, run `xvfb-run -a npm run test:e2e`. **Every UI change needs
E2E coverage.** Traces and screenshots of failed tests are kept in `test-results/`.

**Background mode.** `playwright.config.ts` sets `MPP_E2E_BACKGROUND=1` unless it is
already set. In this mode (`isBackgroundTestMode` in `src/main/window.ts`) every test
window is shown inactive, fully transparent, click-through and without a Dock or taskbar
entry, and background throttling is off, so the suite never steals focus and you can keep
working while it runs. Playwright drives the page through the DevTools protocol, which is
unaffected. To watch the tests, run them with the windows visible:

```bash
MPP_E2E_BACKGROUND=0 npx playwright test --grep "mode"
```

**Shortcuts in tests.** Application shortcuts are routed by the main process in
`before-input-event` (`src/main/keyboard.ts`). Key presses from Playwright's
`page.keyboard` are injected through the DevTools protocol and bypass that hook, so tests
press shortcuts with the `pressShortcut()` helper of `tests/e2e/fixtures.ts`, which uses
`webContents.sendInputEvent` like a real key press. Use `page.keyboard` only for typing
text and for keys the editors handle themselves.

**Isolation and teardown.** The fixtures give every test a fresh `MPP_USER_DATA_DIR` and a
temporary workspace, stub native dialogs and `shell.openExternal` (nothing is handed to
the OS), fail the test on any renderer console error or warning, page error, crash or
main-process error, and close every launched app (killing it if it does not exit in time).

## Linting, formatting and type-checking

- **TypeScript**: strict mode with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.
  `tsconfig.node.json` covers main, preload and shared; `tsconfig.web.json` covers the
  renderer and shared.
- **ESLint**: flat config (`eslint.config.js`) with `typescript-eslint`'s
  `strictTypeChecked` and `stylisticTypeChecked` presets and React Hooks rules. Warnings
  fail the build (`--max-warnings 0`). `console.log` is not allowed; use `console.warn` /
  `console.error` for genuine diagnostics.
- **Prettier**: single quotes, semicolons, trailing commas, 2-space indentation, print
  width 110, LF line endings (`.prettierrc.json`, `.editorconfig`).

```bash
npm run lint
npm run format:check   # or: npm run format
npm run typecheck
```

## Generating icons

The app icon is designed as a vector in [`build/icon.svg`](../build/icon.svg)
(1024 × 1024, macOS icon grid: an 824 px tile with a 100 px transparent margin). The PNGs
are generated from it with Electron itself — no native image tools are needed:

```bash
npm run icons
```

(`npm run icons` runs `electron scripts/generate-icons.mjs`.)

This writes:

| File                       | Used by                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `build/icon.png` (1024 px) | electron-builder, which derives the macOS `.icns` and the Windows `.ico` from it |
| `build/icons/<n>x<n>.png`  | Linux packages (16, 24, 32, 48, 64, 128, 256, 512, 1024 px)                      |

The script renders the SVG at every size (rather than downscaling one bitmap) so small
sizes stay crisp. Re-run it whenever `icon.svg` changes, look at the 16 px and 32 px
results, and commit the SVG together with the PNGs.

## Packaging locally

```bash
npm run package          # current OS
npm run package:mac      # dmg + zip (x64, arm64)
npm run package:win      # NSIS installer + portable exe (x64, arm64)
npm run package:linux    # AppImage, deb, tar.gz (x64, arm64) and rpm (x64)
```

Output goes to `release/`. Configuration lives in
[`electron-builder.yml`](../electron-builder.yml): app id, file associations, Electron
fuses, targets and artifact names. Notes:

- Cross-building: macOS artifacts can only be built on macOS. From macOS, electron-builder
  also cross-builds the Linux `AppImage`, `tar.gz` and `deb` and the Windows NSIS and
  portable `.exe` (unsigned). The `.rpm` needs `rpmbuild` (`brew install rpm` on macOS,
  `sudo apt install rpm` on Debian/Ubuntu). The release workflow builds every target
  natively on its own OS runner.
- Local builds are unsigned. On macOS, electron-builder signs them ad hoc so they run on
  Apple silicon. Set `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip looking for a signing
  identity in your keychain.
- The asar archive contains only `out/**` (without source maps) and `package.json`: Vite
  bundles every npm dependency, so `node_modules` is excluded in `electron-builder.yml`.
  Check it with `npx asar list release/mac-arm64/MarkDown++.app/Contents/Resources/app.asar`
  and the fuses with `npx electron-fuses read --app release/mac-arm64/MarkDown++.app`.
- To try a packaged build without an installer, open `release/mac*/MarkDown++.app`,
  `release/win-unpacked/MarkDown++.exe` or `release/linux-unpacked/markdownplusplus`.
- Playwright's `_electron.launch()` cannot drive a packaged build: it needs Node's
  `--inspect`, which the `EnableNodeCliInspectArguments` fuse disables. To automate a
  packaged build, start its executable with `--remote-debugging-port=0` and attach with
  `chromium.connectOverCDP()` (renderer only; the main process is not reachable).

Official releases are built by CI; see [release.md](release.md).

## Toolchain notes

Dependencies are pinned to exact versions and kept current, with two deliberate
exceptions that `npm outdated` reports:

- **`typescript` stays on 6.x.** `typescript-eslint` declares the peer range
  `typescript >=4.8.4 <6.1.0`, so TypeScript 7 (and even 6.1) would be unsupported by the
  type-aware lint rules. Upgrade TypeScript only together with a `typescript-eslint`
  release that widens its peer range.
- **`@types/node` follows the Node version inside Electron, not the newest Node.**
  Electron 44 runs Node 24 in the main process, so `@types/node` is pinned to the latest
  24.x; newer majors would type APIs the app cannot use at runtime. Bump it together with
  an Electron major that moves to a newer Node line.

Both pins are encoded as `ignore` rules in `.github/dependabot.yml`, so Dependabot does
not propose the incompatible majors; lift the rule together with the pin.

The `engines` field (`node >=22.12.0`) only describes the Node version needed for the
tooling (Vite, Vitest, ESLint, electron-builder); the app itself always runs on the Node
bundled with Electron.

## Troubleshooting

| Problem                                                                                               | Fix                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Electron failed to install correctly`                                                                | Delete `node_modules` and run `npm ci` again.                                                                                         |
| Linux: `The SUID sandbox helper binary was found, but is not configured correctly` / namespace errors | On Ubuntu 24.04+: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` for local testing. Never disable the app's sandbox. |
| E2E tests cannot find the app                                                                         | Run `npm run build:app` (or use `npm run test:e2e`, which builds first).                                                              |
| Coverage fails on files you did not touch                                                             | Run coverage for the whole repo on a clean `main` to confirm; never lower the threshold.                                              |
