# Agent Engineering Kit (AEK)

An **evidence-driven, cross-agent AI-native software engineering workflow toolkit** for greenfield projects and existing software repositories.

**Status:** v0.2.0 local integration beta. TypeScript CLI, state machine, requirements/task contracts, quality evidence, and Codex / Claude Code / Cursor Skill installer are implemented and locally tested. **Live agent-host compatibility is not yet verified.**

Read [the comprehensive Chinese guide](README.zh-CN.md), [quick start](docs/09-delivery/quickstart.md), [compatibility](docs/09-delivery/compatibility.md), and [security model](docs/07-verification/security-model.md).

## 60-second CLI intro

Requires Node 22+ and Git. The ZIP includes built JavaScript in `dist/`.

```bash
node ./bin/ai-engineering.mjs --help
node ./bin/ai-engineering.mjs init --project /path/to/repo --kind feature
node ./bin/ai-engineering.mjs install codex --project /path/to/repo --dry-run
node ./bin/ai-engineering.mjs install codex --project /path/to/repo
node ./bin/ai-engineering.mjs start "Add batch attachment downloads to the mail client" --project /path/to/repo
```

Ask the host Agent: “Use `ai-start` to implement this feature.” The host does the LLM work; AEK validates stage transitions, contracts, traceability, and test evidence.

Supported install targets in v0.2: `codex`, `claude`, `cursor`. AEK never overwrites an existing rule or Skill during installation. It does not manage production deployment.

## Development

```bash
npm install
npm run check
```

Built assets are included for offline use. There is no `package-lock.json` because the build environment had no npm registry access; generate and commit a lockfile before public npm publication.

## Scope limitations

Local HMAC evidence is **not a hardened trust boundary** against an agent with unrestricted local file access. Reviewer independence relies on external attestation, and full Agent-specific end-to-end smoke tests remain pending. See [security model](docs/07-verification/security-model.md).

License: MIT.

## V0.2 Agent subprocess and supervised E2E driver

The `agent-stage`, `agent-review`, and `drive` commands invoke your **locally installed and authenticated** Codex / Claude Code / Cursor Agent CLI. They are not an embedded hosted model or unattended cloud service. `drive` pauses for unresolved human decisions, protected Git branches, failing verification, and regulated delivery authorization. Auto-commit is opt-in and restricted to one task contract on a non-protected feature branch. The independent reviewer runs in a fresh temporary Git worktree, not the implementer's context.

```bash
node bin/ai-engineering.mjs agent-check codex
node bin/ai-engineering.mjs agent-check claude
node bin/ai-engineering.mjs agent-check cursor
node bin/ai-engineering.mjs drive --project /path/to/feature-repo --agent codex --reviewer claude --allow-agent-exec --allow-writes --allow-tests --auto-commit --max-fix-attempts 2
```

See [host acceptance guide](docs/09-delivery/v0.2-live-agent-acceptance.md), [runtime architecture and security](docs/03-architecture/v0.2-agent-runtime.md), and [local verification report](docs/09-delivery/v0.2-verification-report.md). **The three commercial Agent CLIs were not installed in the build environment.** Subprocess protocol tests and a fully simulated Agent E2E passed; a live model-driven E2E remains a user-environment acceptance dependency.
