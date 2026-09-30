# Changelog

All notable changes to MarkDown++ are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- MarkDown++ is now open-source software under the permissive MIT License.
- The project page now makes community discussions, beginner-friendly issues and ways to
  contribute easier to discover.

### Security

- Windows: `file://` URIs with a remote host passed on the command line (for example
  `file://server/share/notes.md`) are now ignored instead of being opened as a UNC network
  path, which could connect to an attacker-controlled SMB server and leak NTLM credentials.

### Fixed

- The unit test suite now passes on Windows (platform-neutral path expectations; POSIX-only
  permission tests run only where POSIX permissions exist).

## [1.0.0] - 2026-09-29

The first stable release.

### Added

#### Editing

- Visual mode (WYSIWYG) editor based on Milkdown / ProseMirror with live formatting of
  headings, emphasis, strikethrough, inline code, links, lists, task lists, quotes, rules,
  tables, code blocks, math and images.
- Slash menu (`/`) to insert any block, block drag handles to move blocks, and a floating
  toolbar for the current selection.
- Markdown input rules in Visual mode (`# `, `- `, `1. `, `- [ ] ` (or `[ ] ` at the start
  of a list item), `> `, ` ``` `, `---`, `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``).
- Tables with row and column editing, per-column alignment (GitHub Flavored Markdown) and
  faint column separators while editing.
- Code blocks with syntax highlighting for more than 100 languages and a language picker.
- Inline and display math rendered with KaTeX, with size and macro-expansion limits so a
  formula cannot freeze the editor.
- YAML front matter is kept verbatim: Visual mode shows it read-only in a _Front matter_
  panel above the document, Markdown mode edits it.
- Local images relative to the document (served through a restricted `mpp-file:`
  protocol) and optional remote images.
- Markdown mode (source) based on CodeMirror 6 with Markdown syntax highlighting,
  highlighted fenced code, line numbers, word wrap (at the readable column width of
  Visual mode) and spell checking.
- One-click switch between Visual mode and Markdown mode (`⌘E` / `Ctrl+E`); the Markdown
  text is the single source of truth, so switching never loses content, and keyboard
  focus moves to the new editor.
- Typing a change and undoing it by hand restores the original text, so a file is not
  marked as changed only because Visual mode would write it in its canonical style.
- Formatting toolbar and formatting commands that work in both modes.
- Find & replace in both modes with match case, whole word and regular expressions,
  highlighting of every match and a live match counter (`⌘F` / `Ctrl+F`; Find and Replace
  is `⌘⌥F` on macOS, where `⌘H` hides the app, and `Ctrl+H` on Windows and Linux).
  Regular expressions with nested repetition such as `(a+)+`, or that are too slow for
  the document, are refused instead of freezing the window.

#### Documents and workspace

- Tabs with unsaved-change indicators, reordering, middle-click to close and drag & drop
  of files onto the window. Tabs shrink before they overflow; faded edges show hidden
  tabs, the mouse wheel scrolls the tab bar, an **All open documents** menu lists every
  tab, and the active tab stays in view.
- Open, save, save as, save all, close, close all, recent files and reveal in file manager.
  Save As and Export start in the folder of the current document.
- Preservation of line endings (LF / CRLF) and UTF-8 byte-order marks; atomic saves (temp
  file + rename) with an in-place fallback for hard-linked or foreign-owned files, folders
  without create permission and briefly locked files on Windows. Write-protected files
  are never overwritten.
- Files that are not UTF-8 (for example Windows-1252 or UTF-16), binary files and files
  over 50 MB are refused with a clear message instead of being corrupted on save.
- Save As onto a file that is open in another tab with unsaved edits asks whether to
  discard them, keep them in an untitled tab or save them elsewhere.
- Autosave after a delay or on focus change, session restore of open tabs and their modes.
- Detection of files changed or deleted by other programs, with automatic reload of clean
  documents (keeping focus, caret, scroll position and undo history) and a reload/keep
  banner for documents with unsaved changes.
- Close and quit handshake between the main process and the window: every unsaved
  document is asked about, **Cancel** keeps the window (and on macOS cancels the quit),
  and an unresponsive window is closed after a timeout.
- Deterministic keyboard shortcuts: the main process routes every shortcut in
  `before-input-event`, so each key press runs its command exactly once in both editors.
- Outline sidebar (top-level headings), focus mode, zoom, status bar with mode, cursor
  position or selection size, word and character counts, reading time, line ending,
  encoding, zoom and save state.
- Command palette (`⌘⇧P` / `Ctrl+Shift+P`) with fuzzy search over all commands and recent
  files; keyboard shortcut reference dialog in the platform's notation.
- Welcome screen and an interactive welcome document introducing the main features.
- Export to self-contained, sanitised HTML and to PDF, styled like the editor.
- Recent files on an unplugged drive or offline share are hidden but kept; opening and
  saving never fail because the recent files list cannot be written.

#### Theming

- 21 built-in UI colour schemes with automatic light/dark switching that follows the
  operating system. Picking a scheme for the other appearance explains when it will be
  used and offers **Use it now**; badges show _Used in light mode_ / _Used in dark mode_.
- 34 built-in code themes styled after classic IDEs and editors, plus an _Auto_ mode that
  pairs a code theme with the active UI theme.
- 11 built-in element styles controlling typography and the look of headings, quotes,
  code blocks, inline code, tables, lists, links, horizontal rules and images, previewed
  as miniature documents; all of them use bundled fonts or fonts that ship with every OS.
- Custom theme editor for all three layers with contrast warnings, a live preview that
  follows the element group you edit, and JSON import/export in a versioned theme file
  format.
- Curated source font list with a _Custom…_ option and a live sample line; JetBrains Mono
  and Inter are bundled.

#### Platform and packaging

- Installers and portable builds for macOS (dmg, zip; x64 and arm64), Windows (NSIS
  installer and portable exe; x64 and arm64) and Linux (AppImage, deb, tar.gz for x64 and
  arm64; rpm for x64).
- Portable mode with a `MarkDownPlusPlus-data` folder next to the application.
- File associations for `.md`, `.markdown`, `.mdown`, `.mkd` and `.mkdn`; single-instance
  handling that opens files in the running window; on macOS, files opened from Finder
  while no window is open get a new window, and on Linux `file://` URIs from file
  managers are accepted.
- The first window fits small displays (e.g. 1366 × 768).
- Tolerant settings loading that falls back to defaults for damaged sections.

#### Project

- Documentation: README with screenshots, tutorial, user guide (with known limitations),
  installation guide, theming guide, keyboard shortcuts, architecture, development and
  release guides.
- Contribution guidelines, code of conduct, security policy, support guide and rules for
  AI coding agents.
- CI on macOS, Windows and Linux (lint, format check, type-check, unit tests with ≥ 95 %
  coverage, Playwright E2E tests in an invisible background mode), CodeQL analysis,
  Dependabot, and an automated release pipeline with optional code signing and
  notarisation.

### Security

- Sandboxed, context-isolated renderer without Node.js access; a single narrow preload
  API; DevTools disabled in packaged builds.
- Strict Content Security Policy (`script-src 'self'`, no `unsafe-eval`); raw HTML in
  documents is never executed; exported HTML is sanitised with DOMPurify, and PDFs are
  rendered in a hidden, sandboxed window with JavaScript disabled.
- Every IPC call checks the sender frame and validates its arguments with zod; expected
  failures return typed errors instead of rejected promises.
- File access grant model: reading, writing, watching and revealing any file requires a
  grant from a user action (open/save dialog, OS open request, a dropped Markdown/text
  file after resolving symlinks, the recent files list) or a document of the session file
  as it was found at startup. A compromised renderer cannot grant itself new files, and a
  saved session keeps only granted paths.
- Remote images are off by default (_Load remote images_), so opening a document cannot
  act as a tracking pixel; while the setting is off the main process also cancels every
  remote image request.
- The `mpp-file:` protocol serves only image files up to 50 MB. On Windows, images on
  network (UNC) paths are only loaded from servers that host a file you opened, and
  device paths never, so a document cannot leak NTLM credentials to an attacker's SMB
  server (in the editor and in exports).
- Navigation and new windows are blocked; external links open only for `https:`, `http:`
  and `mailto:`, and `mailto:` links keep only recipients and `to`, `cc`, `bcc`, `subject`
  and `body`, so a link cannot make the mail client attach a local file.
- All permission requests (camera, microphone, geolocation, notifications, …) are denied.
- Themes are pure data validated against schemas; imported element styles with
  out-of-range values are rejected.
- Electron fuses (no `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` or `--inspect`, ASAR integrity
  validation, loading only from the ASAR archive) and the hardened runtime on macOS.
- Supply chain: pinned dependencies and GitHub Actions (full commit SHAs), Dependabot,
  CodeQL, least-privilege workflows, signing credentials scoped to the packaging step,
  and release packaging without dependency lifecycle scripts.

[Unreleased]: https://github.com/Amadudl/MarkDownPlusPlus/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Amadudl/MarkDownPlusPlus/releases/tag/v1.0.0
