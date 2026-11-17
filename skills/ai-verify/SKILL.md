---
name: ai-verify
description: Use when running executable tests and storing trusted evidence instead of self-reported pass assertions.
---

# ai-verify

Use this Skill for the `verify` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/06-verify.md`. Inspect commands, ask explicit authorization for execution, then run `aek verify --allow-exec`. If all passed run `aek advance`; otherwise repair and reverify. Never manually create signed evidence.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
