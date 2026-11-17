# Agent 兼容性矩阵（V0.2，本地资产与 CLI 子进程协议验证结果）

**S1 = 生成标准 Skill；S2 = 项目规则与命令适配；S3 = 在目标 Agent 宿主完成全流程真实冒烟。** 已建立 S1/S2 文件验证以及 CLI 启动参数/结果协议的模拟 Agent 子进程测试，均不代表 S3。这里的“实现”仅指本包适配代码，不等于目标平台官方认证。

| 目标 | 项目安装位置 | 规则位置 | 本包实现 | 目标宿主实测 |
|---|---|---|---|---|
| Codex | `.agents/skills/` | `AGENTS.md` | S1 + S2 + CLI 模拟协议测试 | 待真实模型实测 |
| Claude Code | `.claude/skills/` | `CLAUDE.md` | S1 + S2 + CLI 模拟协议测试 | 待真实模型实测 |
| Cursor | `.cursor/skills/` | `.cursor/rules/ai-engineering.mdc` | S1 + S2 + CLI 模拟协议测试 | 待真实模型实测 |
| OpenCode | 待适配 | 待适配 | 未实现 | 未实测 |
| Windsurf | 待适配 | 待适配 | 未实现 | 未实测 |
| Kilo | 待适配 | 待适配 | 未实现 | 未实测 |
| Gemini CLI | 待适配 | 待适配 | 未实现 | 未实测 |
| GitHub Copilot | 待适配 | 待适配 | 未实现 | 未实测 |
| Antigravity | 待适配 | 待适配 | 未实现 | 未实测 |
| Augment | 待适配 | 待适配 | 未实现 | 未实测 |
| TRAE | 待适配 | 待适配 | 未实现 | 未实测 |
| CodeBuddy / WorkBuddy | 待区分两套插件模型 | 待适配 | 未实现 | 未实测 |
| Cline | 待适配 | 待适配 | 未实现 | 未实测 |
| Qoder | 待适配 | 待适配 | 未实现 | 未实测 |

本包适配路径参考：

- Codex：https://learn.chatgpt.com/docs/build-skills
- Claude Code：https://support.claude.com/en/articles/14554922-claude-code-user-faq
- Cursor：https://cursor.com/docs/skills

平台版本发生变动时，应使用对应平台官方文档重验 Skills 入口、规则行为和命令能力。应对每个 Agent 分别记录：安装验证、可发现 Skill、短提示词触发、文件读写、CLI 执行、门禁阻断、恢复能力、独立审查与交付审批，不能将单一静态文件检查当作完整适配。

V0.2 的实际操作命令及验收证据清单：[`v0.2-live-agent-acceptance.md`](v0.2-live-agent-acceptance.md)。本环境执行 `agent-check`：Codex、Claude、Cursor 均返回 `available: false`（未安装），不能将它们列为宿主实测成功。
