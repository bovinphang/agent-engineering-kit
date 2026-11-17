# Agent Engineering Kit V0.1.0 本地验证报告

执行日期：2026-11-17
执行环境：Node.js 22.16.0 / Linux 容器 / TypeScript 编译器 5.9 兼容环境 / Git 2.47.3。

## 已执行测试类别

| 验证范围 | 内容 | 验证方式 |
|---|---|---|
| 初始化 | dry-run、幂等性、不覆盖现有配置 | Node 测试 |
| 智能问答协议 | 阻塞型 DEC、选项回答、重复运行恢复 | Node 测试 |
| Spec / 合同 | FR/AC 语义、重复/缺失校验、DAG、自引用、路径穿越与覆盖率 | Node 测试 |
| 状态机 | 阶段推进、重启恢复、修改 Spec 后自动失效 | Node 测试 |
| 质量证据 | 真实子进程退出码、错误命令、HMAC 篡改、日志/工作区/源树变更 | Node 测试 |
| Git 保护 | 未提交源文件和合同外提交拒绝验证 | Node 测试 |
| Agent 安装 | Codex/Claude/Cursor 安装文件检测、不覆盖已有规则、只卸载未修改文件 | Node 测试 |
| 审查门禁 | 不同 Reviewer/Context、High 未关闭、缺审查拒绝放行 | Node 测试 |
| 九阶段 E2E | regulated 交付批准前阻断，批准后进入复盘并完成 | Node 测试 |
| CLI 冒烟 | 子进程调用 bin，初始化→安装→检测→启动→状态→卸载 | Node 测试 |

## 已执行的真实命令

```bash
npm run lint
npm run typecheck
npm run build
node --test tests/*.test.mjs
```

输出以本次 `npm run check` 的实际执行日志为准；可自行重新运行验证。此报告不是认证证书，结论只适用于上述已覆盖场景。

## 当前本地执行结论

已通过 21 个 Node 测试（含 9 阶段 regulated 流程、代码提交变更后证据失效、交付文档提交不误失效，以及安装符号链接防护）。运行 `npm run check` 可复现。

## 未覆盖的真实宿主验证

- 未在个人 Windows 10、Codex CLI、Claude Code CLI、Cursor IDE 内实际调用 Skills 完成从自然语言到业务源码生成。
- 未接入外部 Claude/Codex 模型 API、独立 Reviewer 服务和可信 CI 签名。
- 未作 npm Registry 发布、Windows/macOS 全平台安装测试。
- 仅支持 JSON 任务契约、3 个首批 Adapter；未实现通用 YAML 解析器、多 Agent 自动调度、可信发布审批 GUI。
