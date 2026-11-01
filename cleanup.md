# Cleanup Unabhängigkeit

Dauerhafte Aufgabenliste aller Verstöße gegen das Gesetz Unabhängigkeit (Stichtag 01.11.2026). Nie löschen; Erledigtes mit Datum abhaken.

## Offen

### Wiedervorlage

- [ ] opensource.md: Ausnahme Vorgabe für React, Milkdown und CodeMirror am 2027-01-01 mit Amadeus neu entscheiden (Punkt 4 und 5) → Ziel: Ausnahme verlängern oder nachbauen

### Abhängigkeiten der Kategorie Sonstige (package.json)

- [ ] package.json: @fontsource-variable/inter liefert eine Schrift als npm Paket (Punkt 4 und 7) → Ziel: assets
- [ ] package.json: @fontsource-variable/jetbrains-mono liefert eine Schrift als npm Paket (Punkt 4 und 7) → Ziel: assets
- [ ] package.json: lucide-react liefert fremde Icons (Punkt 4 und 7) → Ziel: assets
- [ ] package.json: katex ist fremder Code samt CSS und Schriften (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: rehype-katex ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: rehype-stringify ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: remark-gfm ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: remark-math ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: remark-parse ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: remark-rehype ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: unified ist fremder Code (Punkt 4) → Ziel: lib-markdown
- [ ] package.json: zod ist fremder Code (Punkt 4) → Ziel: lib-validation
- [ ] package.json: zustand ist fremder Code (Punkt 4) → Ziel: lib-state
- [ ] package.json: @testing-library/jest-dom ist fremder Code (Punkt 4) → Ziel: lib-testing
- [ ] package.json: @testing-library/react ist fremder Code (Punkt 4) → Ziel: lib-testing
- [ ] package.json: @testing-library/user-event ist fremder Code (Punkt 4) → Ziel: lib-testing
- [ ] package.json: eslint-plugin-react-hooks ist fremder Code (Punkt 4) → Ziel: nachbauen
- [ ] package.json: globals ist fremder Code (Punkt 4) → Ziel: nachbauen

### Fremde Schriften und Vorlagen im Code

- [ ] src/renderer/src/export/katex-css.ts:1: bindet katex.min.css aus dem Paket katex roh in den Export ein (Punkt 2) → Ziel: lib-markdown
- [ ] src/renderer/src/export/katex-css.ts:12-32: bettet 20 KaTeX Schriften aus dem Paket katex in exportierte Dokumente ein (Punkt 7) → Ziel: assets
- [ ] src/renderer/src/themes/export-fonts.ts:17-35: bettet Inter und JetBrains Mono aus den @fontsource Paketen in exportierte Dokumente ein (Punkt 7) → Ziel: assets
- [ ] src/renderer/src/themes/presets/code-themes.ts:3-1506: Syntaxthemes tragen Namen fremder Produkte und bilden laut Kopfkommentar (Zeile 3 bis 6) deren Farbschemata nach (etwa Monokai Pro ab Zeile 187, VS Code ab Zeile 10, IntelliJ ab Zeile 671, Xcode ab Zeile 759); Herkunft der Farbwerte prüfen, eigene Paletten mit eigenen Namen (Punkt 3 und 7) → Ziel: nachbauen
- [ ] src/renderer/src/themes/presets/ui-themes.ts:195-712: Oberflächenthemes Nord, Dracula, One Dark, Solarized, Gruvbox, Tokyo Night, Catppuccin, Rosé Pine, Monokai und GitHub bilden fremde Farbschemata nach (Punkt 3 und 7) → Ziel: nachbauen
- [ ] src/renderer/src/themes/presets/element-styles.ts:55: Elementstil „GitHub“ bildet das Aussehen eines fremden Produkts nach (Punkt 3 und 7) → Ziel: nachbauen
- [ ] src/renderer/src/themes/presets/code-pairing.ts:11-37: Zuordnung verweist auf die nachgebildeten Themes; mit deren Ablösung anpassen (Punkt 3) → Ziel: nachbauen

### Medien im Repo

- [ ] build/icon.png: App Icon im Repo statt über den Assets Weg (Punkt 7) → Ziel: assets
- [ ] build/icon.svg: App Icon im Repo statt über den Assets Weg (Punkt 7) → Ziel: assets
- [ ] build/icons/: App Icons in acht Größen im Repo statt über den Assets Weg (Punkt 7) → Ziel: assets
- [ ] docs/images/: Screenshots der Doku im Repo statt über den Assets Weg (Punkt 7) → Ziel: assets

### Kandidaten für eigene Libs

- [ ] src/main/services/atomicWrite.ts: atomares Schreiben mit Windows Rename Retry, vermutlich auch in anderen eigenen Projekten nötig (Punkt 6) → Ziel: lib-fs
- [ ] src/main/services/jsonStore.ts: JSON Dateien lesen und schreiben mit SerialQueue (Punkt 6) → Ziel: lib-fs
- [ ] src/main/services/fileWatcher.ts: Dateiüberwachung (Punkt 6) → Ziel: lib-fs
- [ ] src/shared/ipc-result.ts: typisiertes IPC Ergebnis mit Fehlercodes (Punkt 6) → Ziel: lib-electron
- [ ] src/main/ipcErrors.ts: Umwandlung von Fehlern in IPC Antworten ohne Ausnahmetexte (Punkt 6) → Ziel: lib-electron
- [ ] src/main/security.ts: Content Security Policy und sichere externe URLs für Electron (Punkt 6) → Ziel: lib-electron
- [ ] src/renderer/src/commands/fuzzy.ts: unscharfe Suche für Befehlspaletten (Punkt 6) → Ziel: lib-ui
- [ ] src/renderer/src/components/common/: IconButton, Kbd, Modal und weitere UI Bausteine (Punkt 6) → Ziel: lib-ui
- [ ] src/renderer/src/themes/color.ts: Farbrechnung (Hex, Mischen, Luminanz) (Punkt 6) → Ziel: lib-ui
- [ ] src/renderer/src/export/slug.ts: Slugs für Überschriften (Punkt 6) → Ziel: lib-markdown
- [ ] src/renderer/src/export/sanitize.ts: Sanitizer Konfiguration für Markdown HTML (Punkt 6) → Ziel: lib-sanitize
- [ ] scripts/third-party-licenses.mjs: Generator für die Lizenzliste aller ausgelieferten Pakete; jedes Repo braucht die transitive Liste nach Punkt 5 (Punkt 6) → Ziel: lib-licenses

### Sonstiges

- [ ] .github/workflows/ci.yml, codeql.yml, release.yml: fremde GitHub Actions (actions/checkout, actions/setup-node, actions/upload-artifact, actions/attest-build-provenance, github/codeql-action) sind in opensource.md nicht erfasst (Punkt 5) → Ziel: opensource.md
- [ ] .github/workflows/unabhaengigkeit.yml: fremde GitHub Action actions/checkout ist in opensource.md nicht erfasst (Punkt 5) → Ziel: opensource.md
- [ ] CODE_OF_CONDUCT.md:1-135: gesamter Text ist laut Hinweis ab Zeile 118 der Contributor Covenant 2.1 (CC BY 4.0) mit Teilen aus Mozillas Durchsetzungsstufen, fremder Text und fremde Vorlage im Repo (Punkt 2 und 7) → Ziel: nachbauen
- [ ] .githooks/lib/secret-scan.sh, .githooks/fix-findings.sh, .githooks/unabhaengigkeit.sh, .githooks/assets-fetch.sh: gleicher Code wie in nav4x:.githooks/ (Hook Kit, identisch in 15 eigenen Repos) (Punkt 6) → Ziel: lib-hookkit

## Erledigt

- [x] package.json: @codemirror/autocomplete ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/commands ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/lang-markdown ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/language ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/language-data ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/lint ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/search ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/state ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @codemirror/view ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: codemirror ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @lezer/highlight ist fremder Code (Punkt 4) → Ziel: lib-editor (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @milkdown/crepe ist fremder Code (Punkt 4) → Ziel: nachbauen (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: @milkdown/kit ist fremder Code (Punkt 4) → Ziel: nachbauen (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: dompurify ist fremder Code, sicherheitskritisch; Nachbau nur mit adversarischen Tests (Punkt 4) → Ziel: lib-sanitize (erledigt 2026-11-01: als dauerhafte Ausnahme in opensource.md eingetragen (Freigabe Amadeus))
- [x] package.json: react ist fremder Code; Ablösung des UI Frameworks berührt den Stack und ist eine Frage nach R7 (Punkt 4) → Ziel: nachbauen (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
- [x] package.json: react-dom ist fremder Code; Ablösung zusammen mit react (Punkt 4) → Ziel: nachbauen (erledigt 2026-11-01: als Ausnahme Vorgabe in opensource.md eingetragen (Freigabe Amadeus), Wiedervorlage 2027-01-01)
