---
name: ai-review
description: Use when requesting an independent context code review of completed and verified changes.
---

# ai-review

Use this Skill for the `review` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/07-review.md`; use a new reviewer session and a separate actor identity. Prepare review.json with real diff findings. Import using `aek review path/to/review.json`, then `aek advance`. A self-review must not be passed off as independent.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
