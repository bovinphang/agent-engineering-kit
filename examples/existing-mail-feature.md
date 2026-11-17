# Existing system example: 企业邮箱附件批量下载

```bash
cd existing-mail-repo
aek init --kind feature
aek install cursor
aek start "在现有企业邮箱增加附件批量下载" --mode feature
```

Agent 先进入 `ai-discover` 阅读现有 UI / API / 鉴权流程，提出跨邮件、容量、权限、下载失败与重试的决策，后续合同限制修改范围，执行既有 lint/test/build。安装器不会覆盖现有规则与业务代码。
