---
name: ai-design
description: Use when designing software architecture, interfaces, databases, alternatives, security boundaries and rollback.
---

# ai-design

Use this Skill for the `design` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/03-design.md`; write `docs/03-architecture/design.md` and ADR. Compare alternative approaches and present critical choices for human authorization. Run `aek advance` only after real requirements resolved.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
