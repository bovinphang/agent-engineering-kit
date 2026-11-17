---
name: ai-discover
description: Use when investigating an existing codebase before adding a feature, repairing a bug or writing a spec.
---

# ai-discover

Use this Skill for the `discover` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Inspect README, current modules, tests, API, dependency versions, build and architecture in read-only mode. Identify risky touching points. Store report in `docs/01-requirements/codebase-discovery.md`. Continue with `ai-requirements`. No edit to existing business source during discovery.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
