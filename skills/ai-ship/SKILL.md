---
name: ai-ship
description: Use when preparing acceptance evidence, release documentation, approval checks or a guarded software delivery.
---

# ai-ship

Use this Skill for the `deliver` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/08-ship.md`; write acceptance.md linked to evidence, use `aek release-ready`. For regulated projects get human authorization through `aek approve deliver --actor human`; never automatically deploy. Run `aek advance` when authorized and ready.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
