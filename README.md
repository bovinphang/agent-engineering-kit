# Agent Engineering Kit (AEK)

An **evidence-driven, cross-agent AI-native software engineering workflow toolkit** for greenfield projects and existing software repositories.

**Status:** v0.1.0 local MVP. TypeScript CLI, state machine, requirements/task contracts, quality evidence, and Codex / Claude Code / Cursor Skill installer are implemented and locally tested. **Live agent-host compatibility is not yet verified.**

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

Supported install targets in v0.1: `codex`, `claude`, `cursor`. AEK never overwrites an existing rule or Skill during installation. It does not manage production deployment.

## Development

```bash
npm install
npm run check
```

Built assets are included for offline use. There is no `package-lock.json` because the build environment had no npm registry access; generate and commit a lockfile before public npm publication.

## Scope limitations

Local HMAC evidence is **not a hardened trust boundary** against an agent with unrestricted local file access. Reviewer independence relies on external attestation, and full Agent-specific end-to-end smoke tests remain pending. See [security model](docs/07-verification/security-model.md).

License: MIT.
