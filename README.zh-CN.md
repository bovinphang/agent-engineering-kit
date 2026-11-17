# Agent Engineering Kit (AEK) — AI 原生软件研发工程插件

> V0.1.0 先行 MVP（源代码与本地 CLI 已实现、自动测试已建立）。**没有直接运行任何 Codex/Claude/Cursor 宿主会话进行人工或模型端真实冒烟**，因此不应将“安装目录已验证”宣传为“三平台端到端闭环已通过”。

[English](README.md) · [快速上手](docs/09-delivery/quickstart.md) · [兼容性矩阵](docs/09-delivery/compatibility.md) · [安全边界](docs/07-verification/security-model.md)

## 核心特点

- **不要求长 Prompt**：用户在 Agent 中用普通语言描述需求，由 `ai-start` / `ai-resume` Skills 加载当前阶段内置 Prompt；Agent 生成短问答供用户选择。
- **九阶段闭环**：需求 → Spec → 技术设计 → 可执行任务契约 → TDD 实现 → 自动验证 → 独立审查 → 交付验收 → 经验沉淀。
- **确定性门禁**：阶段状态原子保存、阶段产物 SHA256 变更失效、FR/AC/Task 追溯校验、依赖 DAG、受限路径审计。
- **真实测试证据**：仅在明确执行授权后运行 JSON 契约中的 argv 命令，采集退出码、脱敏日志、Git SHA、源树哈希与 HMAC 签名；测试失败不能推进。
- **安装非侵入**：Codex、Claude Code、Cursor 的 Skills/Rules 安装先预览、保留已有文件，卸载只删除曾安装且内容未改动的文件。
- **安全默认**：生产发布、受保护分支合并、外发、数据库删除均不自动执行。Cli 的 `release-ready` 只作交付就绪性检查。

## 下载后的最短体验

要求 Node.js 22+ 和 Git。解压本仓库发行包后，先使用内置已编译好的 CLI，无需在线安装运行时依赖。

```bash
# 在解压目录的根目录中：
node ./bin/ai-engineering.mjs --help

# 初始化一个新项目，替换为你自己的项目目录路径
node ./bin/ai-engineering.mjs init --project /path/to/my-project --kind greenfield

# 预览后安装 Codex 入口（可替换 claude 或 cursor）
node ./bin/ai-engineering.mjs install codex --project /path/to/my-project --dry-run
node ./bin/ai-engineering.mjs install codex --project /path/to/my-project

# 从一句话开始（在项目里运行也可以省略 --project）
node ./bin/ai-engineering.mjs start "开发一个带审批流程的员工请假管理系统" --project /path/to/my-project
node ./bin/ai-engineering.mjs status --project /path/to/my-project
```

也可以进入插件解压目录执行 `npm link` 注册命令 `aek` / `ai-engineering`，然后直接 `aek init` / `aek install codex`。在当前离线环境中已验证 `node bin/...` 执行方式，未对用户 Windows 环境进行实测。

安装后启动相应 Agent（例如 Codex、Claude Code、Cursor）并在项目目录聊天：**“帮我做一个员工请假系统，按 ai-start 流程完成。”** 第一次可显式提及 `ai-start` 以防不同宿主的自动技能触发策略不同。此后 Agent 负责阅读 Skills 内置 Prompt、生成产物、提出必须确认的业务问题，并调用 `aek` 完成确定性检查。

## 完整操作序列

| 阶段 | 宿主 Skill | CLI 门禁 | 最小产物 |
|---|---|---|---|
| P1 需求分析 | `ai-requirements` | `aek advance` | `analysis.md` + 已确认 DEC |
| P2 Spec | `ai-spec` | `aek advance` | `spec.md`（FR/AC） |
| P3 技术设计 | `ai-design` | `aek advance` | `design.md`、ADR |
| P4 任务拆解 | `ai-plan` | `aek contract-check`, `aek advance` | `TASK-*.json` |
| P5 实现 | `ai-build` | `aek advance` | 可追溯 commit 和测试 |
| P6 自动验证 | `ai-verify` | `aek verify --allow-exec`, `aek advance` | 真实日志和签名证据 |
| P7 独立审查 | `ai-review` | `aek review <review.json>`, `aek advance` | 外部会话审查记录 |
| P8 交付 | `ai-ship` | `aek release-ready`, `aek advance` | `acceptance.md` |
| P9 改进 | `ai-learn` | `aek advance` | `lessons.md` |

**重要：** `aek advance` 只进行当前已实现的机器门禁；不等于已经证明业务规则正确、接口符合合规要求或 Agent 已完成真正独立审查。

## 项目目录（安装后）

```text
my-project/
├── AGENTS.md / CLAUDE.md / .cursor/rules/  # 仅创建不存在的规则文件
├── .agents/skills/ 或 .claude/skills/ 或 .cursor/skills/
├── .ai-engineering/
│   ├── config.json          # 工程配置（允许版本控制）
│   ├── state.json           # 状态快照（忽略 Git）
│   ├── events.ndjson        # 运行事件记录（忽略 Git）
│   ├── prompts/             # 动态阶段 Prompt 来源（安装器生成）
│   ├── install-manifests/   # 已安装资产的所有权记录
│   └── evidence/            # 本地验证日志（忽略 Git）
└── docs/
    ├── 01-requirements/   ├── 02-product-design/ ├── 03-architecture/
    ├── 04-database/       ├── 05-api/            ├── 06-tasks/contracts/
    ├── 07-verification/   ├── 08-reviews/        ├── 09-delivery/
    └── 10-feedback/
```

## 项目开发及测试

```bash
npm install                        # 开发时获取 typescript 与 @types/node
npm run lint                       # Skill / Prompt / Schema 结构检查
npm run typecheck                  # TypeScript 严格类型检查
npm run build                      # 构建 Node 22 ESM
npm test                           # 真实 Node 测试（无需 Agent API）
npm run check                      # 全量本地门禁
```

由于制作时环境无法访问 npm Registry，**没有编造 npm-lock.yaml / package-lock.json**。源码包含已编译的 `dist/` 供离线用户直接运行；CI 使用线上 `npm install`，首次联网完成依赖解析后建议补齐锁文件并固定供给链版本。此版本的静态检查基于严格 TypeScript + 自定义资源校验，尚未引入 ESLint。

## 安全 / 能力边界

1. 本项目不自行调用任何 LLM，也不会在 CLI 内自动实现真实业务逻辑。**自动化问答、编码和审查内容必须由宿主 Agent 执行**；CLI 只管理项目协议和客观门禁。
2. 本地 HMAC 对证据文件的保护只能抵抗意外或无密钥的手工篡改，不能作为恶意 Agent 获得本机读权限后的可信证明。银行等高风险场景应使用受保护的 CI、人工审批和外部 Reviewer。
3. Reviewer 的不同身份/上下文仅作为记录导入时的结构校验，不是对独立身份的不可抵赖验证。
4. 默认执行任何实际验证命令都需要显式 `--allow-exec`，不自动联网/发布生产。Runner 不使用 shell 字符串，但契约中的可执行程序仍可能产生副作用，执行前必须审查。
5. 新增功能的文档与实现需在 P6 之前提交 Git；P8/P9 交付记录与源码测试证据分别追踪，避免误失效。

## 发展计划

V0.2：版本化 Git worktree 调度、可信 CI Gate/Reviewer 集成、完整 Prompt/Skill 压力场景实测、差异预览 UI、跨平台真实宿主演练。V0.3：其他 Agent Adapters、NPM 分发、企业审批、MCP / 可视化平台。

现阶段请按 `docs/09-delivery/compatibility.md` 的实测级别评估，**不要据此认为全部 14 种工具已经兼容。**
