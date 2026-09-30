# CLAUDE.md

**All repository rules live in [AGENTS.md](AGENTS.md). Read and follow it.**

@AGENTS.md

## Claude-specific notes

- Start by reading `docs/architecture.md`, the files in `src/shared/` and the module you
  are about to change, including its colocated tests.
- Prefer investigating (reading code, running tests) over asking. Ask only about product
  decisions that cannot be inferred from the code or docs.
- Before reporting a task as finished, run the commands listed in
  [AGENTS.md → Commands to run before finishing](AGENTS.md#commands-to-run-before-finishing)
  and quote the real results (test count, coverage percentages, E2E status).
- Keep changes focused. Do not reformat unrelated files or touch generated output
  (`out/`, `release/`, `coverage/`).
- When independent sub-tasks exist (for example main-process service + renderer UI +
  docs), parallelise them with sub-agents, but keep ownership of each file clear.
- Never commit, push or tag unless explicitly asked. Never edit `LICENSE`.
