---
name: ai-start
description: Use when the user describes a new software project, feature or bugfix in plain language and wants an agent-managed engineering workflow.
---

# ai-start

Use this Skill for the `start` workflow. Start by reading `.ai-engineering/prompts/core/system.md` and `aek status`, then load only the relevant phase Prompt.

## V0.2 subprocess support

If the user launches this skill interactively *inside* Codex / Claude Code / Cursor, use stage prompts and `aek` gates directly; avoid recursively starting the same Agent CLI with `aek drive`. When the user launches AEK from an **external terminal**, `aek drive --agent codex --reviewer claude --allow-agent-exec --allow-writes --allow-tests --auto-commit` is the resumable single-command workflow. Running agents, tests or Git auto-commit requires explicit authorization and a feature branch.

## Actions

Begin with `aek status` in the project. If no run exists: `aek init --kind greenfield|feature`, `aek install <current-agent>`, then `aek start "user requirement"`. Explain the first necessary question, load `ai-requirements`, and continue to the P1 deliverable. Never overwrite existing repository rules.

## Guardrails / Blockers

- Block if any critical DEC is unresolved, current stage differs, files exceed task scope, or CI/test evidence is missing.
- If unsupported host functionality is required (fresh session, shell, git, deployment), disclose the limitation and request an external handoff rather than claiming automatic completion.
- Never treat model-generated text as machine verification or human approval. Do not mutate `.ai-engineering/state.json` manually.

## Output

Report phase, files written, actual command results, unresolved options and the next safe operation. Prefer short questions with recommendations instead of requiring a long prompt.
