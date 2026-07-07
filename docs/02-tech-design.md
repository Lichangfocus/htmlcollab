# 技术设计：HTML Collab

## 0. 设计原则

1. **不动用户的 HTML 语义**：渲染必须忠实。评论能力通过"发布时注入锚点属性 + 运行时 overlay 脚本"实现，不重写用户内容。
2. **锚点稳定性优先**：整个产品的体验成败在于"agent 改完 HTML 后，旧评论还能不能钉在原来的元素上"。
3. **单人可维护**：MVP 用一个全栈框架 + 一个数据库文件跑起来，不引入消息队列、不做微服务。
4. **不信任用户 HTML**：它是任意的、可执行脚本的第三方内容，必须沙箱隔离。

## 1. 系统总览

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│ 本地（创作者）                │  HTTPS  │ 服务端（Next.js 单体）              │
│                             │         │                                  │
│  Claude Code ──▶ index.html │         │  ┌ API 层（REST）                  │
│        │                    │  push   │  │  /api/pages /versions /comments│
│  htmlcollab CLI ────────────┼────────▶│  ├ 发布管线：instrument(html)      │
│  （含 MCP server 模式）       │◀────────┼  │   注入 data-cc-id + SDK script  │
│                             │  pull   │  ├ 锚点迁移：remap(v_n → v_n+1)    │
└─────────────────────────────┘         │  └ 存储：Postgres(SQLite dev)      │
                                        │       versions.html 存 DB blob    │
┌─────────────────────────────┐         │                                  │
│ 浏览器（评审者）               │         │  Viewer Shell（Next.js 页面）      │
│                             │         │   ├ 顶栏/评论侧栏/版本切换           │
│  打开链接 ──▶ Viewer Shell    │◀────────┤   └ <iframe sandbox> ──────┐     │
│   iframe 里跑用户 HTML        │         │      /raw/:versionId  ◀────┘     │
│   + overlay SDK(postMessage) │         │      （独立子域，带 CSP）           │
└─────────────────────────────┘         └──────────────────────────────────┘
```

组件只有三个：**CLI**（npm 包，内含 MCP server）、**Web 单体**（Next.js：API + Viewer）、**数据库**。

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| Web 框架 | Next.js 15 (App Router) + TypeScript | API 路由 + 页面一体，部署到 Vercel/Fly 都容易 |
| UI | Tailwind CSS + shadcn/ui | 评论侧栏、弹层等组件快速成型 |
| 数据库 | Drizzle ORM；开发用 SQLite，生产 Postgres | 一套 schema 两端跑；MVP 阶段 HTML blob 直接进 DB（单文件 < 5MB 限制），省掉对象存储 |
| HTML 处理 | `parse5`（服务端解析/注入）+ `cheerio`（查询） | 标准兼容的 HTML 解析，注入属性不破坏原文 |
| CLI | Node + `commander`，MCP 用 `@modelcontextprotocol/sdk` | 与 Claude Code 生态同构 |
| 实时性 | MVP 用 SWR 轮询（5s）；v2 换 SSE | 评论不是高频事件，轮询足够 |
| 部署 | 主站 `app.example.com`；用户内容 `raw.example.com` | **不同源**隔离用户脚本，见 §6 |

## 3. 数据模型

```sql
pages (
  id          text pk,          -- nanoid，即链接 slug
  title       text,
  owner_token text,             -- 创建时发给 CLI，持有即所有者（MVP 权限模型）
  created_at  timestamp
)

versions (
  id          text pk,
  page_id     fk -> pages,
  number      int,              -- v1, v2, ...
  html        text,             -- instrument 后的 HTML（已含 data-cc-id）
  notes       text,             -- push 时可带的说明
  created_at  timestamp,
  unique(page_id, number)
)

comments (
  id          text pk,
  page_id     fk -> pages,
  version_id  fk -> versions,   -- 创建时所在版本
  parent_id   fk -> comments null, -- 线程回复
  anchor      jsonb,            -- 见 §4，顶层评论必填，回复为 null
  body        text,
  author_name text,             -- 评审者昵称（localStorage 记住）
  author_token text null,       -- 创作者/agent 发的评论带 owner_token 标识
  status      text,             -- open | resolved | outdated（仅顶层评论有效）
  created_at  timestamp
)
```

## 4. 锚点系统（核心难点）

### 4.1 锚点结构

```jsonc
{
  "ccId": "cc-x7f3a9",        // 首选：发布时注入的稳定 ID
  "css": "main > section:nth-of-type(2) > div.pricing-card:nth-child(1)",
  "tag": "div",
  "classes": ["pricing-card"],
  "textDigest": "sha1 of 归一化后前 120 字符文本",  // 用于跨版本模糊匹配
  "snippet": "<div class=\"pricing-card\">…</div>" // 截断到 500 字符，pull 时展示给 agent
}
```

### 4.2 发布管线：instrument

`push` 上传原始 HTML 后，服务端做两件事再入库：

1. **注入 `data-cc-id`**：遍历 body 内所有"可评论元素"（块级 + 主要交互元素，跳过 script/style），没有 `data-cc-id` 的注入一个新 ID，已有的**原样保留**。
2. **不注入 SDK 到存储的 HTML**——SDK 在 `/raw/:versionId` 响应时动态注入 `<script src="…/overlay.js">`，保持库内 HTML 干净，SDK 可独立升级。

### 4.3 为什么锚点能在 agent 改动后存活（关键闭环）

```
push v1 ──▶ 服务端注入 cc-id ──▶ CLI 把 instrument 后的 HTML 写回本地文件
                                          │
        agent 在这份带 cc-id 的文件上继续修改（cc-id 是普通属性，编辑天然保留）
                                          │
push v2 ──▶ 老元素带着原 cc-id 回来 ──▶ 评论精确跟随；新元素补发新 id
```

配套约定：`pull` 输出的上下文里明确写一句给 agent 的指令——**"修改时保留所有 data-cc-id 属性；删除元素时连同其 cc-id 删除；不要复制 cc-id 到新元素"**。这是产品与 agent 之间的协议。

### 4.4 锚点迁移（remap）

新版本入库时，对每条 open 评论：

1. `ccId` 在新版本中存在 → 直接跟随（覆盖 95% 场景）。
2. 不存在（agent 整段重写过）→ 降级模糊匹配：同 `tag` 候选集里按 `textDigest` 相似度 + class 交集打分，超过阈值则改绑新元素并更新锚点。
3. 都失败 → 标记 `outdated`，评论栏仍可见（附旧 snippet），但不再钉在页面上。

MVP 可以只实现第 1、3 步，第 2 步是后续增强。

## 5. Overlay SDK（评审端交互）

一个独立打包的 `overlay.js`（vanilla TS，无框架，~10KB），注入到 iframe 内的用户页面，与外层 Viewer Shell 通过 `postMessage` 通信：

- **hover**：mousemove 命中最近的带 `data-cc-id` 祖先，画高亮框（绝对定位 div，不改目标元素样式），角标显示 `tag.class`。
- **select**：click 时 `preventDefault`（仅评论模式下），把 `{ccId, rect, snippet}` postMessage 给 Shell，Shell 弹评论框。
- **badge**：Shell 把已有评论的锚点列表发进来，SDK 在对应元素旁画数字气泡；点击气泡 → 通知 Shell 打开该线程。
- **scroll-to**：Shell 侧栏点击评论 → SDK 滚动到元素并闪烁高亮。
- 评论模式关闭时 SDK 完全休眠，页面行为与原 HTML 无异。

消息协议（双向，全部带 `source: 'htmlcollab'` 标记）：
`shell→sdk`: `init(anchors[]) / setMode(on|off) / focusAnchor(ccId)`
`sdk→shell`: `elementSelected(anchor) / badgeClicked(ccId) / anchorRects(…)`

## 6. 安全模型

用户 HTML = 不可信第三方代码，处理原则：

- **独立源**：`/raw/:versionId` 只从 `raw.example.com` 提供（开发期用不同端口模拟），与主站不同源 → 用户脚本拿不到主站 cookie/storage。
- **iframe sandbox**：`sandbox="allow-scripts allow-same-origin"`（same-origin 只相对 raw 源；若后续 raw 域也承载敏感内容再收紧为仅 allow-scripts + srcdoc）。
- **CSP**：raw 响应带 `Content-Security-Policy: frame-ancestors app.example.com`，防止别人把内容页嵌走；主站正常 CSP。
- **API 鉴权**：写操作分两类——管理类（push、resolve、删除）验 `owner_token`（Bearer）；评论类（评审者）验页面存在 + 简单速率限制。MVP 不做用户账号。
- 上传限制：单文件 ≤ 5MB，text/html only。

## 7. API 设计（REST）

```
POST   /api/pages                      创建页面（CLI 首次 push），返回 {pageId, ownerToken, url}
POST   /api/pages/:id/versions         push 新版本 {html, notes} → 触发 instrument + remap
GET    /api/pages/:id/versions/:n      版本元信息
GET    /raw/:versionId                 渲染用 HTML（动态注入 overlay.js，raw 域）
GET    /api/pages/:id/comments?version=n&status=open
POST   /api/pages/:id/comments         {anchor, body, authorName, parentId?}
PATCH  /api/comments/:id               {status} — resolve/reopen（owner）
GET    /api/pages/:id/context?format=md|json   ← pull 的核心端点，见 §8
```

## 8. Agent 回流格式（pull / MCP）

`GET /context?format=md` 输出（也是 `htmlcollab pull` 的 stdout）：

```markdown
# 协作反馈：落地页 v3（3 条待处理，1 条已解决）
> 修改约定：保留元素上的 data-cc-id 属性；删除元素时连同属性删除；勿复制到新元素。

## [open] #c_a1b2 — 王芳 · 2小时前
- 元素: <section class="pricing"> (data-cc-id="cc-x7f3")
- 片段: `<section class="pricing" data-cc-id="cc-x7f3"><h2>价格</h2>…`
> 价格档位太多了，砍成三档，突出中间那档
  ↳ 李雷: 同意，另外年付折扣要更明显

## [open] #c_c3d4 — 王芳 · 1小时前
- 元素: <button class="cta-primary"> (data-cc-id="cc-99ab")
> 按钮文案改成"免费开始"，别用"立即注册"
```

MCP server（`htmlcollab mcp`，stdio）暴露工具：

| 工具 | 说明 |
|---|---|
| `list_comments(pageId?, status?)` | 拉取结构化评论（默认当前目录关联的页面） |
| `get_version_html(pageId, n?)` | 取某版本 instrument 后的 HTML |
| `push_version(html, notes?)` | 发布新版本，返回链接 + remap 结果 |
| `resolve_comment(commentId, reply?)` | 标记解决，可附一条"已按建议修改"回复 |

CLI 在项目目录写 `.htmlcollab.json`（pageId + ownerToken + 文件映射），pull/push/MCP 都从这里读配置。

## 9. 代码仓库结构（monorepo, pnpm workspace）

```
html-collab/
├─ apps/web/            # Next.js：API 路由 + Viewer Shell + raw 服务
│   ├─ app/(viewer)/p/[pageId]/page.tsx
│   ├─ app/api/…
│   └─ lib/{instrument,remap,db}/
├─ packages/overlay/    # overlay.js SDK（vanilla TS，esbuild 打包，产物拷入 web/public）
├─ packages/cli/        # htmlcollab CLI + MCP server
├─ packages/shared/     # anchor 类型、消息协议、zod schema（三端共用）
└─ docs/
```

## 10. 主要风险与对策

| 风险 | 对策 |
|---|---|
| agent 重写整段 HTML，cc-id 丢失 | pull 上下文中的保留约定（§4.3）+ 模糊 remap 兜底 + outdated 兜底展示 |
| 复杂 CSS/JS 页面在 iframe 中渲染异常 | 忠实转发原 HTML、不做任何重写是底线；raw 域独立避免路径/同源问题 |
| overlay 高亮与用户页面自身的事件冲突 | 评论模式用捕获阶段监听 + 关闭模式即完全休眠 |
| 恶意 HTML（钓鱼、挖矿脚本） | 沙箱 + 独立源解决安全问题；滥用治理（举报/封禁）留到有真实用户后 |
| DB 存 HTML blob 膨胀 | MVP 限 5MB/文件；量起来后版本 HTML 迁 S3/R2，schema 里已按 id 引用，迁移成本低 |

## 11. 多 agent 集成策略（服务形态）

约束：用户可能用任何 agent（Claude Code / Codex CLI / Gemini CLI / Cursor / Windsurf / Aider / 云端 agent…），产品不能绑死单一生态。

**结论：能力只存在于 API 和 CLI 两层，其余全部是零逻辑薄壳。**

```
┌ 生态物料层   SKILL.md / .cursor/rules / AGENTS.md 片段（从同一源文件生成，纯说明书）
├ 协议增强层   htmlcollab mcp（stdio MCP server，支持 MCP 的 agent 用）
├ 通用适配层   npx htmlcollab-cli CLI ← 主入口：所有能跑 shell 的 agent 的最大公约数，免安装免配置
└ 能力本体     HTTP API（/context 直接输出 agent 可读 markdown，没有 shell 的网页 agent 也能消费）
```

依据：
- 所有 coding agent 的最大公约数是"能执行 shell 命令"，`npx` 让 CLI 做到零预配置，因此 CLI 是主形态。
- Skill 不能执行任何东西，只是教 agent 用 CLI 的说明书，且各家格式不一 → 只作分发物料。
- MCP 覆盖广但有注册摩擦 → 作为深度集成增强，不作唯一入口。

自描述与自传播设计：
1. **`pull` 输出即使用手册**：上下文 markdown 头部写明 data-cc-id 保留约定 + "处理完毕运行 `npx htmlcollab-cli push` 发布新版本"，任何 agent 读到反馈的同时学会闭环。
2. **`htmlcollab install`**：探测环境（`.claude/` → 写 skill + 注册 MCP；`.cursor/` → 写 rules；兜底 → AGENTS.md 片段），一条命令完成生态适配。
3. **协议公开**：跨 agent 的真正契约是三样东西——上下文 markdown 格式、data-cc-id 保留约定、`.htmlcollab.json` 配置文件。任何 agent 不经 CLI 直接调 API 也能参与循环。

### 11.1 自动触发设计（用户不需要记得这个工具）

前提认知：agent 时代的工具触发靠的不是用户记忆，而是 agent 对常驻上下文规则的语义匹配。原则：**用户与产品发生一次接触后，触发永久自动**。

三层触发机制：

1. **语义触发（主力）**：skill/rules/AGENTS.md 中的触发描述是核心资产，必须穷举用户的自然表达而非功能术语。触发词表（持续迭代）：
   - 在线化类："做成在线的"、"部署一下"、"给我个链接"、"放到线上"
   - 协作类："发给 XX 看看"、"和 XX 协同/一起改"、"收集反馈"、"让大家提意见"、"评审一下"
   - 英文：share / publish / collaborate / get feedback / send a link
2. **项目内信号自触发**：规则中写明——项目存在 `.htmlcollab.json` 时，处理任何 HTML 任务前先 `pull` 检查未处理反馈；修改完成后主动提议发布新版本。效果：首次 push 后项目即被"感染"，后续用户零指令参与循环。
3. **MCP 工具描述兜底**：`publish_page` 等工具的 description 写清触发场景，对已注册 MCP 的 agent 构成第二路语义匹配。

规则物料参考文案（`htmlcollab install` 写入的内容，三生态同源）：

```markdown
# HTML 在线协作（htmlcollab）
- 用户表达"做成在线的 / 发给别人看 / 协同 / 收集反馈 / 要个链接"等意图时，
  运行 `npx htmlcollab-cli push <file>`，把返回链接交给用户。
- 项目中存在 .htmlcollab.json 时：处理 HTML 相关任务前先 `npx htmlcollab-cli pull`
  检查未处理反馈；完成修改后主动询问是否发布新版本。
```

冷启动（agent 从未接触过本产品）无法凭空解决，靠分发压缩首次接触成本：
- 上架 Claude Code 插件市场、MCP registry、Cursor 目录；
- **病毒循环**：每个发布页页脚带一行"用你的 agent 运行 `npx htmlcollab-cli init` 发布你自己的页面"——评审者即潜在创作者，看一次页面即完成首次接触。
