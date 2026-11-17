# AI-Native Engineering Kit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可恢复、可审计、跨 Agent 的 AI-Native 研发 MVP：先支持 Codex、Claude Code、Cursor；支持从一句需求启动新项目和为现有项目新增功能。

**Architecture:** TypeScript CLI 提供确定性状态机、文档/契约校验、问题决策、真实测试执行与证据存档；Skills 作为各 Agent 的可复用入口，平台适配器输出规则/命令文件，用户不需逐阶段粘贴 Prompt。Agent 的实际代码编写由其宿主执行，CLI 不能虚构模型执行能力。

**Tech Stack:** Node.js 22+、TypeScript（实际落地时锁定兼容稳定版本）、pnpm workspace、Vitest、Zod 或 JSON Schema 验证器、Git CLI、GitHub Actions；默认不需要数据库服务。

**Spec:** `AI-Native-Engineering-架构与PRD-V1.0.md`（在仓库落地时建议存为 `docs/01-requirements/prd.md`）。

## Global Constraints

- 与用户真实代码库兼容，默认只增量新增 `.ai-engineering/`、Skills、必要规则和 docs，不移动业务源码。
- 关键业务规则必须用户确认；不得以推荐方案代替授权。
- `state.json` 只能由内核 API 修改，独立的 Reviewer 不能自己批准自己。
- 生产部署、受保护分支合并、数据删除与外发属于授权操作。
- 所有 `PASS` 必须有可核查的真实执行证据与 Commit SHA。
- Agent 不具备真实子 Agent 能力时，可交由外部新会话或 CI 审查，不能用自检冒充独立审查。
- 所有单任务重试有上限，失败须可恢复，不得永远循环。
- 安装器必须先 preview/diff，处理已有文件时确认合并策略，禁止默默覆盖。

## Review Focus

1. **已有业务仓库的覆盖风险**：已有 `AGENTS.md`、`CLAUDE.md` 或 `.github/workflows` 时，安装器是否保留用户内容，并提供冲突解决预览？→ Task 8/9 集成测试。
2. **产物过期风险**：Spec 的 FR/AC 修改后，已有设计、任务、测试证据是否被正确标记 stale 并阻止交付？→ Task 2/4 集成测试。
3. **伪造通过风险**：手动写入 `evidence.json`、退出码非零、测试命令缺失时，门禁是否拒绝 PASS？→ Task 6 测试。
4. **越权操作风险**：任务合同外文件修改，执行器是否检测到 diff 超界？→ Task 5/6 测试。
5. **审查不独立**：实现与审查身份相同、无隔离上下文，是否拒绝标记 independent_review_passed？→ Task 7 测试。

---

## Part A：统一仓库开发计划

### Task 1：建立 CLI 包与项目配置模型

**Files:**
- Create: `packages/core/src/config.ts`, `packages/core/test/config.test.ts`
- Create: `packages/cli/src/index.ts`, `packages/cli/test/init.test.ts`
- Create: `packages/core/src/contracts/config.schema.json`
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`

**Interfaces:**
- Produces: `loadConfig(projectRoot: string): Promise<ProjectConfig>`、`initProject(root: string, options: InitOptions): Promise<InitResult>`。
- ProjectConfig fields: `schemaVersion`, `projectKind`, `riskProfile`, `autonomy`, `runner`, `technologyProfiles`, `customRules`。

- [ ] Step 1: 添加缺少配置、配置损坏、现有文件冲突的失败测试。
- [ ] Step 2: 执行 `pnpm --filter @kit/core test -- config`，验证先失败。
- [ ] Step 3: 实现配置模型与只创建缺失文件的 init；支持 `--dry-run`。
- [ ] Step 4: 复测，确保重复 init 幂等。
- [ ] Step 5: Commit `feat(core): add safe project initialization`。

### Task 2：实现 FSM、检查点与变更失效追踪

**Files:**
- Create: `packages/core/src/workflow/states.ts`, `store.ts`, `transitions.ts`, `invalidation.ts`
- Test: `packages/core/test/workflow.test.ts`, `packages/core/test/invalidation.test.ts`

**Interfaces:**
- Consumes: `ProjectConfig`。
- Produces: `startRun()`, `getRun()`, `transition(runId, stage, event, evidenceRef)`, `resumeRun()`, `invalidateFromArtifactChange()`。
- Events: `stage_started`, `artifact_validated`, `question_blocked`, `gate_failed`, `review_approved`, `stage_approved`, `stage_invalidated`。

- [ ] Step 1: 编写非法跳转、重启恢复、中途崩溃、重复事件、Spec 变更失效的失败测试。
- [ ] Step 2: 单独运行这些测试并确认失败。
- [ ] Step 3: 采用原子写 + append-only 事件日志 + 事务式状态快照实现 FSM。
- [ ] Step 4: 验证旧证据失效时不得继续 release；重复事件不会重复写入错误状态。
- [ ] Step 5: Commit `feat(core): persist resumable workflow state`。

### Task 3：实现决策引擎与选项式问题契约

**Files:**
- Create: `packages/core/src/questions/types.ts`, `queue.ts`, `decisions.ts`
- Create: `schemas/question.schema.json`
- Test: `packages/core/test/questions.test.ts`

**Interfaces:**
- Produces: `rankQuestions(context, candidates): Question[]`、`recordDecision(questionId, answer, actor): Decision`、`getBlockingQuestions(runId): Question[]`。

- [ ] Step 1: 添加“已回答不重问”“财务/权限阻塞问题不能默认跳过”“选项缺少推荐理由”等失败测试。
- [ ] Step 2: 验证失败。
- [ ] Step 3: 实现必要问题优先级与不可自动批准策略；决策写入带来源的审计记录。
- [ ] Step 4: 验证再进相同项目可复用已确认决定且能在变更后重问。
- [ ] Step 5: Commit `feat(core): add guided decisions`。

### Task 4：实现 FR/AC/Task 追溯校验

**Files:**
- Create: `packages/core/src/spec/parse.ts`, `traceability.ts`, `validate.ts`
- Create: `schemas/spec.schema.json`
- Test: `packages/core/test/spec.test.ts`

**Interfaces:**
- Produces: `validateSpec(spec: Spec): ValidationReport`、`buildTraceability(spec: Spec, tasks: TaskContract[]): CoverageReport`。

- [ ] Step 1: 写 FR 重号、缺 AC、NFR 无验证方法、孤立任务、删 FR 未失效等失败测试。
- [ ] Step 2: 验证失败。
- [ ] Step 3: 实现严格 ID/引用检查和覆盖率报告，失败时列出具体 ID 与路径。
- [ ] Step 4: 复测所有正反例。
- [ ] Step 5: Commit `feat(core): enforce requirement traceability`。

### Task 5：任务契约 Schema、DAG 与变更范围审计

**Files:**
- Create: `packages/core/src/tasks/contract.ts`, `dependency-graph.ts`, `scope-audit.ts`
- Create: `schemas/task-contract.schema.json`
- Test: `packages/core/test/task-contract.test.ts`

**Interfaces:**
- Produces: `validateTaskContract(contract)`, `topologicalTasks(tasks)`, `auditChangedPaths(task, gitDiff)`。

- [ ] Step 1: 为环依赖、未知前置任务、无测试命令、越界文件、glob 绕过写失败测试。
- [ ] Step 2: 确认失败。
- [ ] Step 3: 完成结构校验、DAG 排序、路径归一化与可解释的错误报告。
- [ ] Step 4: 运行快速测试并做路径安全审查。
- [ ] Step 5: Commit `feat(core): validate executable task contracts`。

### Task 6：命令执行器、真实证据及质量门禁

**Files:**
- Create: `packages/core/src/quality/runner.ts`, `evidence.ts`, `gates.ts`
- Test: `packages/core/test/quality.test.ts`, `packages/core/test/security.test.ts`

**Interfaces:**
- Produces: `runVerification(task, options): Promise<VerificationEvidence[]>`、`evaluateGate(task, evidence, policy): GateResult`。

- [ ] Step 1: 写非零退出码、超时、命令不存在、证据 sha 不匹配、提交变更后证据过期的失败测试。
- [ ] Step 2: 验证失败。
- [ ] Step 3: 实现子进程受限执行、超时/取消、日志脱敏、输出文件 hash 与绑定 Commit SHA。
- [ ] Step 4: 证明手写 `PASS` 但命令失败时 gate 必须失败；命令缺失返回 blocked。
- [ ] Step 5: Commit `feat(core): enforce evidence-based quality gates`。

### Task 7：独立审查协议与交付门禁

**Files:**
- Create: `packages/core/src/review/reviewer.ts`, `review-gate.ts`, `release-gate.ts`
- Test: `packages/core/test/review-gate.test.ts`

**Interfaces:**
- Produces: `submitReview(review: ReviewEvidence): ReviewResult`、`canRelease(runId): DecisionResult`。

- [ ] Step 1: 测试相同执行者和审查者、High 未关闭、审查证据不足、发布未授权时均拒绝放行。
- [ ] Step 2: 验证失败。
- [ ] Step 3: 实现 reviewer 身份、上下文标识、审查报告 hash、分级问题及授权状态检查。
- [ ] Step 4: 验证独立复核且所有门禁满足才允许 release ready。
- [ ] Step 5: Commit `feat(core): gate independent review and release`。

### Task 8：平台 Adapter SDK、安装器和能力探测

**Files:**
- Create: `packages/adapter-sdk/src/types.ts`, `installer.ts`, `doctor.ts`
- Test: `packages/adapter-sdk/test/installer.test.ts`

**Interfaces:**

```ts
interface AgentAdapter {
  id: string;
  detect(root: string): Promise<boolean>;
  capabilities(root: string): Promise<AgentCapabilities>;
  planInstall(root: string, assets: PackageAssets): Promise<InstallPlan>;
  applyInstall(plan: InstallPlan, approval: InstallApproval): Promise<InstallResult>;
  verify(root: string): Promise<CompatibilityReport>;
}
```

- [ ] Step 1: 测试已有规则保留、同名 Skill 冲突、预览差异、Windows 路径、软链/复制策略与撤销安装。
- [ ] Step 2: 验证失败。
- [ ] Step 3: 实现能力声明、版本与环境探测、安全预览、无覆盖合并、安装验证报告。
- [ ] Step 4: 对临时测试仓库运行 install/uninstall round-trip。
- [ ] Step 5: Commit `feat(adapter): add safe cross-agent installation SDK`。

### Task 9：第一批 Codex、Claude Code、Cursor 适配

**Files:**
- Create: `packages/adapters/src/codex.ts`, `claude.ts`, `cursor.ts`
- Create: `packages/adapters/assets/`（平台特有规则模板）
- Test: `packages/adapters/test/codex.test.ts`, `claude.test.ts`, `cursor.test.ts`

**Interfaces:**
- Implements: `AgentAdapter` from Task 8。

- [ ] Step 1: 编写安装目录、规则片段、触发入口、已有文件保留和 `verify()` 失败测试。
- [ ] Step 2: 确认失败。
- [ ] Step 3: 在单一 `skills/` 来源基础上渲染平台适配结果，不复制修改权威 Prompt。
- [ ] Step 4: 对 Codex、Claude、Cursor 的实际受支持版本逐一人工启动或自动冒烟；记录局限。
- [ ] Step 5: Commit `feat(adapters): support first three agent hosts`。

### Task 10：完整 Prompt、Skills 与 Profile（逐个红绿验证）

**Files:**
- Create: `skills/ai-start/SKILL.md` 等各阶段 Skill
- Create: `prompts/stages/*.md`, `prompts/core/*.md`
- Create: `profiles/web-admin.yaml`, `profiles/legacy-feature.yaml`, `profiles/regulated.yaml`
- Test: `tests/skills/`（多种基线压力场景）

**Interfaces:**
- Consumes: Prompt Resolver/Question/Contract 读入协议。
- Produces: 可按需引用的 Skill，每个 Skill 声明输入、动作、输出、失败策略与使用范围。

- [ ] Step 1: 先为 `ai-requirements` 写没有 Skill 时的失败/偏差场景：胡乱假设审批规则、直接跳代码、没有 FR→AC。
- [ ] Step 2: 在真实 Agent 会话观察基线并留证，而不仅是 Schema 校验。
- [ ] Step 3: 写最小 Skill，再用同样场景验证；修订至合格后，才进入下一个 Skill。
- [ ] Step 4: 重复至 9 阶段流程技能，通过清单校验所有引用文件和触发描述。
- [ ] Step 5: Commit `feat(skills): add tested workflow prompts`。

### Task 11：案例项目、CI 和 E2E 失效测试

**Files:**
- Create: `examples/greenfield-web-admin/`, `examples/existing-mail-feature/`
- Create: `.github/workflows/ci.yml`
- Create: `tests/e2e/greenfield.test.ts`, `tests/e2e/feature.test.ts`, `tests/e2e/recovery.test.ts`

**Interfaces:**
- Consumes: Core、Adapters、Skills。
- Produces: CompatibilityReport、E2E Report、验收录屏/日志链接。

- [ ] Step 1: 为新项目创建、老仓库最小侵入、未解决问题中断、错误证据拒绝、变更失效和恢复写 E2E。
- [ ] Step 2: 验证失败。
- [ ] Step 3: 补全缺失功能、CI 质量门禁和示例。
- [ ] Step 4: 运行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 并确保真实通过。
- [ ] Step 5: 在三种 Agent 上运行可复现冒烟场景，形成各 Agent 支持等级报告。
- [ ] Step 6: Commit `test(e2e): verify complete local engineering workflow`。

### Task 12：发行、升级、迁移与用户手册

**Files:**
- Create: `docs/09-delivery/install.md`, `quickstart.md`, `upgrade.md`, `compatibility.md`, `troubleshooting.md`
- Create: `scripts/release-check.mjs`
- Test: `tests/e2e/upgrade.test.ts`

**Interfaces:**
- Produces: 安装验证脚本、升级/卸载回滚、版本兼容声明、可复制实战手册。

- [ ] Step 1: 写重复安装、升级冲突、回滚恢复、Windows 10 + PowerShell 与 Linux 路径用例。
- [ ] Step 2: 确认失败。
- [ ] Step 3: 实现可重复打包、版本锁定、兼容矩阵导出和安全升级。
- [ ] Step 4: 跑全量测试、真实新老项目案例、release-check。
- [ ] Step 5: Commit `docs(release): ship verified installation handbook`。

## Part B：分阶段用户实战操作手册（**目标命令，尚未实现/发布**）

### B1. 用户只想试用：零基础入口

MVP 实现后期望使用这样的对话：

```text
用户：帮我开发一个员工请假系统。
AI：我会按“需求 → 设计 → 开发 → 测试 → 审查 → 交付”推进。
    先确认：审批由谁发起和完成？
    A. 员工申请，直属主管审批（推荐用于普通内部系统）
    B. 员工申请，主管 + HR 两级审批
    C. 按现有企业审批规则对接
    D. 其他（自行描述）
用户：B
AI：已确认两级审批。我会再确认请假额度/跨年度等阻塞规则，
    然后生成带 FR/AC ID 的 Spec；不要求你亲自编写 Prompt。
```

命令入口可以采用 `/ai-start`，但不是所有 Agent 都保证支持同名 slash command；在无法注册原生命令的平台需使用 Skill 显式调用或自然语言触发。

### B2. 开发者推荐流程

> 以下是**提议的 CLI 设计，不是当前已发布的可用命令**：

```bash
# 未来在项目根目录中执行
agent-engineering init --agent codex --profile standard
agent-engineering start --mode greenfield --request "实现员工请假管理系统"
agent-engineering status
agent-engineering resume
agent-engineering gate --stage verify
agent-engineering review --task TASK-API-001
agent-engineering release --dry-run
```

### B3. 新建项目推荐的实践

1. 新建 Git 仓库或空目录；安装插件后由 `init --dry-run` 预览将新增什么。
2. 输入一句业务目标；Question Engine 仅针对高影响约束补充问题。
3. 确认 Spec 的业务规则、范围和可测 AC；Agent 自动处理分解与代码实现。
4. 遇到风险决策，交互式选项会显示推荐和取舍；普通技术细节遵循 Profile。
5. 对受支持平台的执行过程，实时显示 task 当前步骤、失败的测试和重试次数。
6. 交付前核对 AC、CI、独立审查、风险与发布清单；涉及外部系统请先授权。
7. 发布后生成有来源证据的复盘，不自动将个人机密或业务数据提炼成全局知识。

### B4. 旧项目新增功能推荐实践

1. 先创建工作分支/工作树并对仓库进行只读勘察。
2. 原样保留原项目 lint/test/build/CI，捕获现有 baseline；新增检查时避免忽然引入一套冲突规范。
3. 输入功能需求与影响范围；由 Agent 收集已存在的接口/数据表/组件模式。
4. 只对用户权限、业务规则、兼容性等阻塞决策询问；不擅自升级框架。
5. 生成含 allowed_paths 的最小任务契约，按 TDD 实施并比较前后回归。
6. 通过质量门禁与独立审查后创建 PR；需要回滚时按任务变更集撤销。

### B5. 失败处理与继续

- `blocked`：等待用户决定或缺少依赖，保留决策问题与原始上下文。
- `failed`：存在明确失败证据，可自动修复（限次数）；无进展则转为阻塞报告。
- `stale`：Spec/设计更改后已有下游产物不再有效，按影响范围重新生成和验证。
- `resume`：从最近持久化检查点恢复，不重复执行已经证实安全完成的任务；若执行环境/Commit SHA 改变则重新验证。

## Part C：交付标准与不合格判定

**MVP 必须证明，而不是只声明：**

- 新旧两类项目能跑通真实流程，用户不需手写长 Prompt。
- 需求/测试追溯可机器查验，无 FR 无 AC。
- CI 失败、伪造证据、越界修改和审查非独立均被阻断。
- 断点恢复不会跳过失效的产物或重复造成破坏性副作用。
- 首批三个 Agent 采用真实执行验证，完整兼容只对验证过的版本做承诺。
- 提供安装、升级、卸载、示例项目和故障排查文档。

**明确不合格：** 仅靠 Prompt 表示“必须测试”；仅将 `SKILL.md` 复制到各目录；审查由同一执行上下文给自己放行；未授权自动发布；未测试就宣称 14 平台完整兼容。

## 推荐执行方式

建议按 Task 1～12 顺序执行，其中任务 2～7 可在内核接口确认后并行分工，但仍按独立审查与测试门禁合并。先打通一个小型 greenfield 和一个企业级 legacy feature，再扩展适配平台。对高风险系统，应优先补充 threat modeling 和政策验证的专项用例。
