# Cleanup: independence

Permanent task list of every violation of the owner's independence rule (effective
2026-11-01). Never delete this file or an entry; tick finished tasks with their date and
move them to "Done". Rule points refer to the independence rule (section 1 of the central
agent rules). The accepted exceptions are listed in [opensource.md](opensource.md).

## Open

- [ ] `package.json`, `src/renderer/src/editor/wysiwyg/`: Milkdown (`@milkdown/crepe`, `@milkdown/kit`, transitively ProseMirror, Vue, lodash-es) is third-party code in the shipped app (point 2, 4) → target: rebuild (own WYSIWYG editor); order and scope are an owner decision, the stack is named in the project description
- [ ] `package.json`, `src/renderer/src/editor/source/`: CodeMirror family (`codemirror`, `@codemirror/autocomplete`, `commands`, `lang-markdown`, `language`, `language-data`, `lint`, `search`, `state`, `view`, `@lezer/highlight`) is third-party code in the shipped app (point 2, 4) → target: rebuild (own source editor); first step: drop the direct pins of `codemirror` and `@codemirror/lint`, which own code does not import
- [ ] `package.json`, `src/renderer/src/`: React (`react`, `react-dom`) is the third-party UI framework of the renderer (point 4) → target: rebuild, or owner confirms React as mandated by spec and it moves to that category in opensource.md
- [ ] `package.json`, `src/renderer/src/export/`: unified, remark and rehype family (`unified`, `remark-parse`, `remark-gfm`, `remark-math`, `remark-rehype`, `rehype-katex`, `rehype-stringify`) in the export pipeline (point 2, 4) → target: rebuild (own Markdown to HTML pipeline, candidate for a shared `lib-<topic>`)
- [ ] `package.json`, `src/renderer/src/editor/wysiwyg/inline-math.ts`, `src/renderer/src/export/katex-css.ts`: KaTeX math layout (point 2, 4) → target: rebuild
- [ ] `src/renderer/src/export/sanitize.ts`: DOMPurify is security critical; proposed as a permanent exception by analogy to the crypto and TLS rule (point 4, 5) → target: opensource.md (owner confirms "Permanent"), otherwise rebuild with adversarial tests
- [ ] `src/main/validation.ts`, `src/main/ipc.ts` and other `zod` imports: schema validation with zod (point 4) → target: rebuild (own validator, candidate for a shared `lib-<topic>`), keeping the strictness at every trust boundary
- [ ] `src/renderer/src/store/`: zustand stores (point 4) → target: rebuild (own small store)
- [ ] `src/renderer/src/components/` (all `lucide-react` imports): third-party icon set in the UI (point 4, 7) → target: assets (own icons in the assets repo) plus an own icon component, then drop `lucide-react`
- [ ] `src/renderer/src/themes/fonts.ts`, `src/renderer/src/themes/export-fonts.ts`: fonts Inter and JetBrains Mono come from npm (`@fontsource-variable/*`) instead of the central assets repo (point 7) → target: assets (with `assets/ATTRIBUTION.md` entries, OFL-1.1), then drop the npm packages
- [ ] `src/renderer/src/export/katex-css.ts`: KaTeX fonts are inlined from `katex/dist/fonts` instead of the assets repo (point 7) → target: assets, or they disappear with the KaTeX rebuild
- [ ] `build/icon.svg`, `build/icon.png`, `build/icons/*.png`: app icon (own design) lives in this repo instead of the central assets repo (point 7) → target: assets (fetch via tag or build step, with `assets.lock`)
- [ ] `docs/images/*.png`: documentation screenshots live in this repo instead of the central assets repo (point 7) → target: assets (README and docs links must keep working, `scripts/docs-accuracy.test.ts` checks README link targets)
- [ ] `.github/workflows/`: CI check `unabhaengigkeit` is missing; it must fail when a dependency from `package.json` is missing from opensource.md, when opensource.md or cleanup.md is missing, or when a media or font file in the repo neither comes via the assets path nor is listed here (point 9) → target: rebuild (own workflow `.github/workflows/unabhaengigkeit.yml` calling `.githooks/unabhaengigkeit.sh`)
- [ ] `.githooks/`: the hook kit is missing (`pre-commit` with secret scan, forbidden files, CRLF and project checks including `unabhaengigkeit.sh`; `pre-push`; `install.sh`) (point 9) → target: rebuild (own hook kit)

## Done
