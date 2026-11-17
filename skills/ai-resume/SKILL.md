---
name: ai-resume
description: Use when resuming interrupted agent implementation, restoring stage context or investigating a blocked workflow.
---

# ai-resume

Use this Skill for the `resume` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Run `aek resume` and read the listed stage Prompt and existing approved docs. If stale changes were detected, return to affected phase. Continue, do not start a second run or ask already answered questions. STOP if the previous decision or evidence is untrustworthy.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
