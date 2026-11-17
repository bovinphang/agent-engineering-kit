---
name: ai-learn
description: Use when collecting engineering feedback and proposing reusable verified improvements to prompts, skills or quality gates.
---

# ai-learn

Use this Skill for the `learn` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/09-learn.md`; create lessons.md and an improvement proposal with tests. Run `aek advance` to mark stage complete. STOP before changing common skills without process review.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
