# htmlcollab

把 agent 生成的 HTML 一条命令变成可协作的在线页面：协作者在页面上选中元素评论，所有反馈变成结构化上下文回流给你的 agent。

```bash
npx htmlcollab-cli login             # email + 用户名，免验证
npx htmlcollab-cli push index.html   # 发布 → 协作链接
npx htmlcollab-cli pull              # 反馈 → agent 可读的 markdown
npx htmlcollab-cli install           # 为你的 agent 安装 skill（Claude Code / Cursor / AGENTS.md）
```

在线服务与文档：https://htmlcollab.lichangin.workers.dev/install
