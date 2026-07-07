# 实施路线图：一步步做

原则：每个里程碑结束时都有一个**能跑、能演示**的东西；先打通最薄的完整链路（M0），再逐层加厚。预估以"一个人 + Claude Code"的节奏给出。

---

## M0 — 行走骨架（1~2 天）

目标：**一条命令把本地 HTML 变成可访问链接。** 没有评论，没有 CLI 包，先证明发布链路。

任务：
1. `pnpm` monorepo 初始化：`apps/web`（Next.js + TS + Tailwind）、`packages/shared`。
2. Drizzle + SQLite：建 `pages` / `versions` 两张表。
3. API：`POST /api/pages`（返回 pageId + ownerToken）、`POST /api/pages/:id/versions`（存原始 HTML，暂不 instrument）。
4. `GET /raw/:versionId`：原样吐 HTML（开发期先同域，加 TODO 标记独立域）。
5. Viewer 页 `/p/:pageId`：顶栏（标题 + 版本号）+ 全屏 sandbox iframe 指向 raw。
6. 先用 `curl` 脚本代替 CLI 完成 push。

验收：`curl` 上传一个 Claude Code 生成的 HTML → 浏览器打开 `/p/xxx` 看到完整渲染 → 再传一次变成 v2，顶栏可切换版本。

## M1 — 元素评论（3~5 天）

目标：**评审者在页面上选元素、发评论、看线程。** 这是产品第一次"像那么回事"。

任务：
1. `packages/overlay`：esbuild 打包 vanilla TS SDK —— hover 高亮、click 选中、postMessage 协议（`packages/shared` 定义消息类型）。
2. 发布管线 instrument：parse5 注入 `data-cc-id`（保留已有 ID）；raw 响应时注入 `<script src="/overlay.js">`。
3. `comments` 表 + 评论 CRUD API（含 parentId 线程、status）。
4. Viewer Shell：评论模式开关；选中元素后浮出输入框（首次评论要求填昵称，localStorage 记住）；右侧评论栏（线程列表、回复、resolve）；评论 badge 气泡与双向定位（点评论滚到元素 / 点气泡开线程）。
5. SWR 5s 轮询刷新评论。

验收：两个浏览器（一个无痕）打开同一链接，A 选中一个卡片发评论，B 5 秒内看到并回复，A resolve 后双方状态一致；关闭评论模式后页面交互与原 HTML 完全一致。

## M2 — CLI 与 agent 回流（2~3 天）

目标：**闭环。** push → 评论 → pull → agent 改 → push v2，评论跟随。

任务：
1. `packages/cli`：`htmlcollab push [file]`（首次创建页面并写 `.htmlcollab.json`；**把服务端 instrument 后的 HTML 写回本地文件**，这是 cc-id 存活的关键）、`htmlcollab pull`（调 `/context?format=md` 输出到 stdout）、`htmlcollab open`。
2. `/context` 端点：markdown / JSON 双格式，含修改约定头（保留 data-cc-id 的指令）。
3. remap v1：新版本入库时按 ccId 精确匹配迁移评论，匹配失败标 `outdated`；评论栏区分展示。
4. 端到端自测脚本：用真实的 Claude Code 会话跑一遍完整循环，记录卡点。

验收：`htmlcollab push` → 网页评论 2 条 → `htmlcollab pull | pbcopy` 粘给 Claude Code → 改完 `htmlcollab push` → 网页上 v2 的评论仍钉在正确元素上，被删元素的评论显示 outdated。

## M3 — 生态适配层（2~3 天）

目标：**去掉人肉中转，且不绑定单一 agent**（策略见技术设计 §11：能力只在 API/CLI，其余是薄壳）。

任务：
1. `htmlcollab mcp`（stdio）：`list_comments` / `get_version_html` / `push_version` / `resolve_comment` 四个工具，复用 CLI 的配置与 API client。
2. `resolve_comment` 支持附回复（"已按建议改为三档定价"），评审者在网页端能看到 agent 的答复。
3. `htmlcollab install`：探测环境写入对应生态物料——`.claude/`（skill + MCP 注册）、`.cursor/rules`、兜底 AGENTS.md 片段；三份物料从同一份源文件生成。
4. **触发文案打磨**（§11.1）：物料中的触发描述穷举用户自然表达（"做成在线的 / 发给 XX 看看 / 收集反馈 / 给我个链接"…），并写入项目内信号规则——存在 `.htmlcollab.json` 时改 HTML 前先 pull、改完主动提议 push。
5. `pull` 输出自描述化：头部含闭环指令（"处理完毕运行 `npx htmlcollab push`"），保证陌生 agent 无配置也能走通循环。
6. 写一份 `docs/agent-guide.md`：各主流 agent（Claude Code / Cursor / Codex CLI）的接入方式 + 推荐工作流提示词。

验收：三条——① Claude Code 里说"拉取落地页的反馈并逐条处理"，agent 经 MCP 全自主闭环；② 未配置的 agent（如 Codex CLI）仅靠 `npx htmlcollab pull` 输出也能闭环；③ **触发测试**：在装过 install 物料的环境里只说"这个页面发给老板看看、让他能提意见"（不提工具名），agent 自动 push 并给出链接。

## M4 — 上线打磨（3~5 天）

目标：**能给外人用。**

任务：
1. 生产部署：Vercel（或 Fly.io）+ Postgres（Neon/Supabase）；`raw` 独立子域 + CSP + sandbox 收紧（§6 安全模型全量落地）。
2. 上传限制、速率限制、基础反滥用。
3. 首页：产品说明 + `npx htmlcollab push` 快速开始；空状态、加载态、移动端评审可用（至少只读 + 评论）。
4. **病毒页脚**：每个发布页角落加一行"用你的 agent 运行 `npx htmlcollab init` 发布你自己的页面"——评审者即潜在创作者（§11.1 冷启动）。
5. 遥测：北极星事件埋点（push / first_comment / pull / repush / footer_click）。
6. 发布：npm 发 CLI 包，写 README，上架 Claude Code 插件市场 / MCP registry / Cursor 目录；找 5~10 个用 Claude Code 的朋友跑真实场景。

验收：一个陌生人凭 README 在 10 分钟内完成完整循环。

## M5+ — 视反馈决定（不预先承诺）

模糊 remap（textDigest 相似度）→ 文本级评论 → 多文件站点 → 通知（Slack/钉钉/邮件）→ 轻账号体系与团队空间 → suggest-edit 模式。

---

## 里程碑依赖关系

```
M0 骨架 ──▶ M1 评论 ──▶ M2 CLI/回流 ──▶ M3 生态适配 ──▶ M4 上线
                └────────────┴── 核心差异化在 M2/M3，M1 做到"够用"就前进，
                                 打磨留给 M4
```

下一步：从 M0 的任务 1 开始 —— 初始化 monorepo。
