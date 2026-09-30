# Contributing to MarkDown++

Thank you for helping to make MarkDown++ better! Bug reports, ideas, documentation,
themes and code are all welcome. This guide explains how we work so your contribution
can be merged quickly.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
MarkDown++ is [source-available under a non-commercial license](LICENSE); by submitting a
contribution you agree that it is distributed under the same license.

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Workflow](#workflow)
- [Branch naming](#branch-naming)
- [Commit messages](#commit-messages)
- [Code style](#code-style)
- [Tests and coverage](#tests-and-coverage)
- [No-warnings policy](#no-warnings-policy)
- [Dependencies](#dependencies)
- [Documentation](#documentation)
- [Pull request checklist](#pull-request-checklist)
- [Adding a theme preset](#adding-a-theme-preset)
- [AI coding agents](#ai-coding-agents)

## Ways to contribute

- **Report a bug** or **suggest a feature** using the
  [issue templates](https://github.com/Amadudl/MarkDownPlusPlus/issues/new/choose).
- **Improve the documentation** — typos, unclear sections, missing examples.
- **Contribute a theme preset** — see [below](#adding-a-theme-preset).
- **Fix an issue** — issues labelled `good first issue` are a great start. Comment on the
  issue before you begin so work is not duplicated. For larger changes, open an issue to
  discuss the design first.

Security vulnerabilities are **never** reported publicly; see [SECURITY.md](SECURITY.md).

## Development setup

You need Node.js 22.12+ (see `.nvmrc`) and Git.

```bash
git clone https://github.com/<you>/MarkDownPlusPlus.git
cd MarkDownPlusPlus
npm ci
npm run dev
```

[docs/development.md](docs/development.md) covers the dev loop, debugging, testing and
packaging in detail, and [docs/architecture.md](docs/architecture.md) explains how the
main process, preload and renderer fit together.

## Workflow

1. Fork the repository and create a branch from `main` (see [naming](#branch-naming)).
2. Make focused changes — one logical change per pull request.
3. Add or update tests and documentation together with the code.
4. Run `npm run verify` locally. It runs exactly what CI runs.
5. Push and open a pull request against `main`. Fill in the PR template.
6. CI must be green on macOS, Windows and Linux. A maintainer reviews the PR; please
   respond to feedback by pushing new commits (do not force-push during review).
7. PRs are merged with **squash merge**; the PR title becomes the commit message, so it
   must follow [Conventional Commits](#commit-messages).

## Branch naming

`<type>/<short-kebab-description>`, optionally with the issue number:

| Prefix      | Use for                               | Example                         |
| ----------- | ------------------------------------- | ------------------------------- |
| `feat/`     | new features                          | `feat/table-column-resize`      |
| `fix/`      | bug fixes                             | `fix/142-crlf-lost-on-save`     |
| `docs/`     | documentation only                    | `docs/theming-examples`         |
| `refactor/` | code changes without behaviour change | `refactor/split-document-store` |
| `test/`     | tests only                            | `test/e2e-find-replace`         |
| `chore/`    | tooling, dependencies, release        | `chore/update-electron`         |
| `ci/`       | GitHub Actions                        | `ci/cache-playwright`           |

## Commit messages

We use [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <imperative summary, lower case, no period>

<optional body: what and why, wrapped at 72 characters>

<optional footer: Closes #123, BREAKING CHANGE: …>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`. Common scopes: `editor`, `wysiwyg`, `source`, `themes`, `export`, `settings`,
`main`, `preload`, `ipc`, `ui`, `release`.

Examples:

```
feat(wysiwyg): add column alignment to the table menu
fix(main): preserve UTF-8 BOM when saving
docs(theming): document the theme file envelope
```

## Code style

Formatting is automatic — run `npm run format` (or enable format-on-save with the
recommended VS Code extensions). Beyond formatting:

- **TypeScript strict** everywhere. No `any`, no non-null assertions (`!`) in production
  code, no `@ts-ignore`. Prefer `unknown` + validation at boundaries.
- **Validate at boundaries** with zod: IPC arguments in the main process, files read from
  disk, imported themes.
- **JSDoc** on every exported function, type and constant. Explain _why_, not _what_.
- **Small, cohesive modules** with clear names. Keep React components presentational where
  possible and put logic in stores, commands or plain functions that are easy to test.
- Respect the architecture boundaries described in [AGENTS.md](AGENTS.md#architecture-boundaries):
  `src/shared` has no Node or DOM APIs, the renderer talks to the main process only through
  `window.mpp`, and every IPC channel is defined in `src/shared/ipc.ts`.
- Style: single quotes, semicolons, 2-space indentation, print width 110,
  `import type` for type-only imports.
- No `console.log`. Use `console.warn` / `console.error` only for genuine diagnostics.
- Accessibility: every interactive element is reachable by keyboard and has an accessible
  name; do not rely on colour alone.

## Tests and coverage

- Every change comes with tests. Unit tests are colocated (`foo.ts` → `foo.test.ts`) and
  must exercise real behaviour — no tests that only assert that a function exists.
- Coverage must stay at **≥ 95 %** for lines, branches, functions and statements
  (`npm run test:coverage`). Never lower the threshold or add coverage exclusions to make
  a build pass.
- **UI changes require end-to-end tests** in `tests/e2e/` that drive the real Electron app
  with Playwright. Unit tests alone are not sufficient for UI features.
- Bug fixes start with a test that reproduces the bug.

See [docs/development.md#testing](docs/development.md#testing) for how to run and debug
tests.

## No-warnings policy

Build output, test output and runtime logs must be free of warnings and errors. This
includes TypeScript, ESLint (`--max-warnings 0`), React warnings in tests (for example
`act(...)` warnings), Vite build warnings and Electron security warnings. Deprecated
APIs and libraries are replaced, not silenced. If a warning genuinely cannot be fixed,
explain why in the PR and get a maintainer's explicit approval.

## Dependencies

Every dependency is a long-term maintenance and security cost. A PR that adds a
dependency must explain why it is needed, why existing dependencies or a small amount of
code are not enough, and confirm that the package is maintained, widely used and has a
compatible license. Dependencies are pinned to exact versions and updated through
Dependabot.

## Documentation

Documentation is part of the change, not an afterthought:

- user-visible behaviour → [docs/user-guide.md](docs/user-guide.md) (and the tutorial if
  the basics change);
- new or changed settings → the [settings reference](docs/user-guide.md#settings-reference);
- shortcuts → [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md);
- theming → [docs/theming.md](docs/theming.md);
- architecture or contracts → [docs/architecture.md](docs/architecture.md);
- every user-visible change → a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md);
- a visible change to a screen shown in `docs/images/` → a new screenshot.

Screenshots in [`docs/images/`](docs/images/) are PNGs of the real app (built with
`npm run build:app`) taken with Playwright's `_electron` API at a window size of
1440 × 900 and the display's native scale factor, with a fresh `MPP_USER_DATA_DIR` and
`MPP_E2E_BACKGROUND=1`. Use a neutral sample document without personal data, hide caret,
hover and selection states, and keep every file below 1.5 MB (shrink the window rather
than recompressing). Every embedded image needs descriptive alt text.

Write in clear, concise English. Use the terms **Visual mode (WYSIWYG)** and
**Markdown mode (source)** consistently.

## Pull request checklist

Before requesting a review, make sure that:

- [ ] the PR title follows Conventional Commits;
- [ ] `npm run lint`, `npm run format:check` and `npm run typecheck` pass;
- [ ] `npm run test:coverage` passes with ≥ 95 % coverage;
- [ ] UI changes have E2E tests and `npm run test:e2e` passes;
- [ ] there are no new warnings in build, test or runtime output;
- [ ] documentation and `CHANGELOG.md` are updated;
- [ ] new dependencies are justified;
- [ ] the [security rules](AGENTS.md#security-rules) are respected.

The same checklist is part of the PR template.

## Adding a theme preset

Built-in presets live in `src/renderer/src/themes/presets/`:

| Layer         | File                | Exported list            |
| ------------- | ------------------- | ------------------------ |
| UI theme      | `ui-themes.ts`      | `BUILTIN_UI_THEMES`      |
| Code theme    | `code-themes.ts`    | `BUILTIN_CODE_THEMES`    |
| Element style | `element-styles.ts` | `BUILTIN_ELEMENT_STYLES` |

1. **Start from the app.** Duplicate the closest preset in **Settings**, tune it live and
   **Export** it. The exported JSON contains exactly the values you need.
2. **Add the preset** as a typed constant (`const myTheme: UiTheme = { … }`) and append it
   to the exported list. Use a unique, lowercase kebab-case `id` and a human-readable
   `name`. The id is persisted in users' settings: never rename or remove an id once it
   has been released.
3. **Credit the original.** If the preset is inspired by an existing palette or IDE
   theme, say so in `description` (code themes and element styles) — for example
   _"Inspired by the classic Monokai scheme"_ — and do not use trademarks as if the theme
   were official.
4. **Accessibility.** Body text, muted text, editor text and links must reach WCAG AA
   contrast (4.5 : 1) against their backgrounds. The preset tests check this for UI themes.
5. **UI themes:** add an entry to `AUTO_CODE_THEME_PAIRING` in `code-pairing.ts` so the
   _Auto_ code theme picks a matching syntax palette.
6. **Tests:** the preset test suites validate every preset against the schema and check
   unique ids and contrast; run `npx vitest run src/renderer/src/themes`.
7. **Docs:** add the preset to the tables in [docs/theming.md](docs/theming.md), update
   the preset counts in the [README](README.md#make-it-yours) if they changed, and add a
   CHANGELOG entry.
8. Attach a screenshot of the preset (Visual mode with headings, a quote, a table and a
   code block) to the PR.

## AI coding agents

AI agents (and humans using them) must follow [AGENTS.md](AGENTS.md), which summarises
the architecture boundaries, commands, security rules and definition of done.
