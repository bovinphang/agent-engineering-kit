# Changelog

## 0.1.0 - 2026-11-17 (local MVP preview)

- Nine-stage recoverable workflow with atomic state and append-only events.
- Guided human decision contract with blocking questions.
- FR/AC task traceability and executable JSON contracts with DAG and scoped paths.
- Git-bound local verification, detached logs, HMAC signatures, stale detection, and review records.
- Codex, Claude Code, Cursor Skill/Rule installers with dry-run, conflict preservation and safe uninstall.
- 12 Agent Skills, nine stage prompts, reference templates, CI starter and bilingual quick starts.
- 22 local Node unit/integration/E2E tests; target-host live model tests pending.

## 0.2.0 - 2026-11-17 (local integration beta)

- Added real subprocess adapters for `codex exec --json`, `claude -p --output-format json`, and `cursor-agent -p --output-format json`.
- Added `aek agent-check`, `agent-stage`, `agent-review` and resumable `drive` orchestration commands.
- Added short structured decision ingestion and blocking human DEC gates.
- Added explicit write/test authorization, branch-protected single-task auto-commits, bounded Agent self-repair, and actual command re-verification.
- Added fresh Git worktree reviewer process with JSON verdict validation, transcript audit, and mutation detection.
- Fixed Git status porcelain leading-whitespace parsing, transcript Git ignore, and same-commit verification evidence retry ordering.
- Added end-to-end simulated Agent fixture, fail-closed tests, and real-host acceptance manual.
- 3 commercial Agent CLI installations were **not** available here; live model end-to-end validation remains pending.
