# Git 协作与 CI 门禁约定

## 分支与工作区

- `main` 保持可构建；采用短生命周期分支 `feat/FR-001-short-name`、`fix/BUG-001-...`、`hotfix/INC-001`。
- 在现有仓库先做只读扫描，禁止安装时移动、格式化或覆盖源代码。
- 并行 Agent 应一任务一 worktree/branch；由 Task DAG 和 `allowed_paths` 限制并发冲突。V0.1 尚未自带自动 worktree 调度器，手动或由宿主 Agent 调度。
- 任务变更需关联 FR-ID、AC-ID、TASK-ID，Commit 使用 Conventional Commits，PR 包括测证据和回滚计划。

## MVP 自身 CI

`.github/workflows/ci.yml` 执行：资源结构 lint、TypeScript typecheck、build、Node 测试与 CLI 冒烟。尚缺 registry 可解析的锁文件，应在正式发行前联网生成 `package-lock.json` 后切换为 `npm ci`。

## 用户项目质量门禁

Task 合同必须配置真实 argv 测试命令并通过 `aek verify --allow-exec`；当前不会替你将项目业务 CI 自动接入 PR Status Checks。建议仓库强制 lint + typecheck + 单测 + build，企业项目追加接口/集成/E2E 与依赖安全扫描；银行项目还必须有人类和受保护环境发布审批。**不可把本地 HMAC 证据作为唯一合并准入条件。**

## 提交基线与证据

将需求、设计、任务合同及业务代码提交 Git 后执行验证。签名证据记录执行时的 Commit SHA 与不含 P8/P9 记录的源树哈希；因此事后补充验收/复盘文档不会凭空把代码测试变成过期，但修改实际代码/Spec/Contract 必须重新跑测试和审查。
