# 常见故障与恢复

| 问题 | 原因 | 处理 |
|---|---|---|
| `A run already exists` | 已有中途状态 | `aek resume`，不能用 `start` 覆盖历史 |
| `Blocking decisions unresolved` | 有待确认 DEC | `aek questions` 查看选项，再由用户 `aek answer DEC-... A` |
| `Spec must declare at least one FR` | FR 未采用 `## FR-001` 标题 | 按模板补充，AC 使用 `AC-FR-001-01: ...` 独立行 |
| `unknown dependency` | task `depends_on` 不存在 | 修复 TASK ID，再 `aek contract-check` |
| `clean, committed working tree` | 源码/设计/合同仍未提交 | 审查 diff，提交后再执行真实验证 |
| `outside task scope` | 最新被验证提交含合同外文件 | 拆分提交或修改并重新批准的合同，不能绕过校验 |
| `evidence missing/stale/signature invalid` | 测试命令失败、代码/合同更改、证据或日志变动 | 重回必要阶段，执行 `aek verify --allow-exec` 后再 `advance` |
| `Independent reviewer missing` | 尚未导入外部审查记录 | 使用新会话审查，导入 review JSON；禁止用实现者自评冒充 |
| 安装输出 `conflicts` | 已有文件不同，安全跳过 | 比较内容并手动合并；不会覆盖 |
| 某些 Agent 找不到 Skill | 目录/版本/触发差异 | `aek adapter-check` 仅验证文件；重启 IDE、手动唤起 Skill 并查对应平台官方说明 |
| Windows Node 没有 `aek` 命令 | 未作全局 npm link | 直接 `node D:\tools\agent-engineering-kit\bin\ai-engineering.mjs ...` |
