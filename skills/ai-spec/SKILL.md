---
name: ai-spec
description: Use when formalizing approved business analysis into FR AC NFR IDs and testable specification.
---

# ai-spec

Use this Skill for the `spec` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/02-spec.md`; produce `docs/01-requirements/spec.md`. Ensure every FR declaration has AC-FR-NNN-NN with a measurable outcome. Run `aek advance`; if blocked correct the document.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
