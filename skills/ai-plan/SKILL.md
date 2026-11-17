---
name: ai-plan
description: Use when decomposing approved software specifications into executable task contracts, dependency graphs and test commands.
---

# ai-plan

Use this Skill for the `plan` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/04-plan.md`; use contract JSON template. Map each FR/AC to tasks, independent deliverables and executable argv tests; write contracts under `docs/06-tasks/contracts/`. Run `aek contract-check` then `aek advance`.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
