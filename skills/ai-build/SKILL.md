---
name: ai-build
description: Use when implementing approved task contracts with TDD, scoped git changes and verifiable commits.
---

# ai-build

Use this Skill for the `implement` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## Actions

Read `.ai-engineering/prompts/stages/05-build.md`; implement one task at a time using isolated git branch. First failing test, then minimum implementation, then tests. Commit code before `aek advance`. STOP if scope or dependency conflict.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
