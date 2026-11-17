---
name: ai-requirements
description: Use when analyzing business goals, incomplete software requirements, permissions, edge cases and decision options.
---

# ai-requirements

Use this Skill for the `requirements` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/01-requirements.md`. Produce `analysis.md`. Create 2–4 clear options for critical ambiguity; use `aek question-add ...` and ask human. After explicit `aek answer ...`, run `aek advance`. Do not write product code in this phase.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
