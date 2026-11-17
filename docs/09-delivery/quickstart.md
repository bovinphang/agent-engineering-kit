# MVP 实战操作指南（Node.js 22 / PowerShell / Linux）

## 1. 安装前检查

```powershell
node --version   # >= v22
git --version
```

解压 `agent-engineering-kit-v0.1.0.zip` 到如 `D:\tools\agent-engineering-kit`。无需 npm Registry 即可直接运行编译后的 JS。后续命令的 `AEK` 变量也可替换为你实际的解压路径。

## 2. Windows PowerShell：已有企业邮箱项目（推荐试点）

```powershell
$AEK = 'D:\tools\agent-engineering-kit'
$Repo = 'D:\code\your-existing-mail-repo'
node "$AEK\bin\ai-engineering.mjs" init --project "$Repo" --kind feature
node "$AEK\bin\ai-engineering.mjs" install codex --project "$Repo" --dry-run
node "$AEK\bin\ai-engineering.mjs" install codex --project "$Repo"
node "$AEK\bin\ai-engineering.mjs" adapter-check codex --project "$Repo"
node "$AEK\bin\ai-engineering.mjs" start '给企业邮箱增加附件批量下载功能' --mode feature --project "$Repo"
node "$AEK\bin\ai-engineering.mjs" status --project "$Repo"
```

在 Codex 中打开 `$Repo`，输入“根据 ai-start / ai-discover，先分析企业邮箱附件批量下载的需求与现有代码，然后按当前阶段继续”。首次输入只需这一句话。若 Codex 已发现 Skill，也可通过 Skill 入口直接触发。

对于 Claude Code，将 `install codex` 改为 `install claude`；对于 Cursor，改为 `install cursor`。在同一仓库分别安装三个适配器可以共享 `.ai-engineering/prompts`，同时不会覆盖原有规则。

## 3. Linux/macOS：全新 Web 中后台

```bash
export AEK="$HOME/tools/agent-engineering-kit"
mkdir -p "$HOME/projects/leave-admin"
cd "$HOME/projects/leave-admin"
node "$AEK/bin/ai-engineering.mjs" init --kind greenfield --risk standard
node "$AEK/bin/ai-engineering.mjs" install claude --dry-run
node "$AEK/bin/ai-engineering.mjs" install claude
node "$AEK/bin/ai-engineering.mjs" start "开发员工请假管理系统，支持申请、审批、查询"
node "$AEK/bin/ai-engineering.mjs" status
```

宿主 Agent 依照 `ai-requirements` Prompt 对业务关键问题提供 2～4 个选项；用户选项后调用 `aek answer DEC-... A`（在未安装全局 CLI 时可继续使用完整 `node .../bin/ai-engineering.mjs`）。

## 4. 需求 → 任务 → 测试 → 审查

P1：写 `docs/01-requirements/analysis.md` 并处理阻塞 DEC；执行 `aek advance`。

P2：写 `docs/01-requirements/spec.md`，每个 FR 标题必须 `## FR-001 ...`，每条 AC 单独成行：`AC-FR-001-01: 具体验收行为`；执行 `aek advance`。

P3：写 `docs/03-architecture/design.md` 与必要 ADR；执行 `aek advance`。

P4：用 `templates/contracts/task-contract.json` 建立 `docs/06-tasks/contracts/TASK-001.json`，填写允许文件路径、真实测试命令数组及 implementer ID；运行 `aek contract-check`、`aek advance`。

P5：在独立 Git 分支完成源码与测试变更，提交批准的需求文档及实现。执行 `aek advance`。本地验证要求**除交付及复盘文档外工作区已提交且干净**。

P6：先阅读 task contract 的命令与运行权限（例如 `node --test` 或 `pnpm test`）。确认可执行后调用 `aek verify --allow-exec`，依据输出复测修复；全部通过才 `aek advance`。本地签名证据存入 `.ai-engineering/evidence/`。

P7：从新的 Agent 会话（或其他可信 Reviewer）得到独立审查记录，按照 `templates/contracts/review.json` 填写 reviewer/context、真实问题并使用 `aek review review.json` 导入。CLI 无法单独证明会话独立，需要外部证据；之后执行 `aek advance`。

P8：写 `docs/09-delivery/acceptance.md` 并执行 `aek release-ready`；regulated 项目需要真正的人工交付授权，本地记录 `aek approve deliver --actor human` 只能表示声明，不能替代生产审批工作流；检查通过后 `aek advance`。该命令**绝不执行部署**。

P9：写 `docs/10-feedback/lessons.md`，改进建议应先验证，执行 `aek advance` 完成此轮研发。

## 5. 恢复、预览与保护

```powershell
node "$AEK\bin\ai-engineering.mjs" resume --project "$Repo"
node "$AEK\bin\ai-engineering.mjs" install codex --project "$Repo" --dry-run
node "$AEK\bin\ai-engineering.mjs" uninstall codex --project "$Repo" --dry-run
node "$AEK\bin\ai-engineering.mjs" uninstall codex --project "$Repo"
```

- 安装已有文件内容不相同时会列入 `conflicts`，不会覆盖。需自行审查并合并。
- 卸载只删除自身创建且仍与原内容一致的文件。共享 `.ai-engineering/prompts` 属于项目工程资产，不由单一 Agent 卸载。
- 修改 `spec.md` / `design.md` / 任务契约，下一次 `status` 会自动判定对应的下游阶段失效；不得使用旧证据交付。
- 手动编辑 `.ai-engineering/state.json` 和 `.evidence-key` 属于破坏性操作，不会被视为合法完成。
- 提供源码包意味着可将其推入个人 GitHub 仓库；**本轮没有代你操作 GitHub 创建/推送仓库。**
