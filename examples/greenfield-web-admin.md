# Greenfield example: 员工请假管理

```bash
aek init --kind greenfield
aek install codex   # 或 claude/cursor
aek start "开发一个员工请假系统，支持申请、审批、统计"
aek status
```

Agent 使用 `ai-requirements` 读取阶段 Prompt，并在重要业务规则不明确时提出 DEC；用户回答后阶段 `aek advance`。最后在完成代码提交与测试命令审查后运行 `aek verify --allow-exec`。实际源码生成需要 Codex/Claude/Cursor 主机完成。
