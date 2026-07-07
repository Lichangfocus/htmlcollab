# htmlcollab 产品文档

> 本文档是产品功能的**唯一现状清单**：记录已上线的能力、明确的边界与已知限制。
> 后续功能补充在「Backlog」一节追加，实现后移入对应功能模块并标注版本。
> 最后更新：2026-07-07 · 线上版本 web@162d6b3 / cli@0.2.0

## 1. 产品定位

**agent 产出 HTML 的协作评审层。** 越来越多内容以 agent 生成的 HTML 为载体，htmlcollab 解决它的协作问题：

```
创作者 agent 产出 HTML ──push──▶ 在线协作链接
        ▲                            │
        │                     协作者选中元素评论（零安装）
        │                            │
     pull ◀──── 结构化反馈上下文 ◀─────┘
（agent 按锚点修改 → push v2，评论自动跟随）
```

三个差异化判断：
1. **反馈即上下文**：评论不是给人看的留言，是给 agent 读的结构化输入（元素锚点 + 线程 + 修改约定）。
2. **协议优先于工具**：跨 agent 的契约是三样东西——上下文 markdown 格式、`data-cc-id` 锚点保留约定、`.htmlcollab.json` 配置。任何 agent 直接调 API 也能参与。
3. **触发靠 agent 语义匹配，不靠用户记忆**：能力藏在 skill/链接后面，用户只说自然语言。

## 2. 在线资产

| 资产 | 地址 |
|---|---|
| 服务主站 | https://htmlcollab.lichangin.workers.dev |
| 一句话安装页（双读者） | https://htmlcollab.lichangin.workers.dev/install |
| 机读安装协议 | https://htmlcollab.lichangin.workers.dev/install.md |
| 激活授权页 | https://htmlcollab.lichangin.workers.dev/activate |
| npm 包 | `htmlcollab-cli`（bin 命令为 `htmlcollab`） |
| Claude Code 插件市场 | `/plugin marketplace add Lichangfocus/htmlcollab` |
| 代码仓库 | https://github.com/Lichangfocus/htmlcollab |
| 样例协作页 | https://htmlcollab.lichangin.workers.dev/p/apv61yao |

## 3. 功能清单（已上线 ✅）

### 3.1 接入与激活

- ✅ **一句话安装**：用户对任何 agent 说「帮我安装这个技能：…/install」；`/install` 页人机双读者设计（人看到魔法句子+复制按钮，agent 看到执行指令块），`/install.md` 提供纯机读协议
- ✅ **多生态物料写入**：`npx htmlcollab-cli install` 探测环境写入 `.claude/skills/htmlcollab/SKILL.md`（Claude Code）/ `.cursor/rules/htmlcollab.mdc`（Cursor）/ `AGENTS.md` 片段（通用兜底）
- ✅ **Claude Code 全局插件**：仓库即插件市场（`.claude-plugin/marketplace.json` + `plugins/htmlcollab`），两条 `/plugin` 命令安装
- ✅ **网页激活授权流**：install 后 agent 把 `/activate` 链接发给用户 → 网页注册/登录 → 页面生成 `npx htmlcollab-cli auth <token>` 指令回粘给 agent → 凭证存 `~/.htmlcollab.json`，此后零登录
- ✅ **注册**：email + 用户名，免邮箱验证（产品决策：前期最低摩擦）

### 3.2 发布（创作者侧）

- ✅ `push <file>`：发布/更新版本，返回协作链接；无 slug 创建新页面，有 slug 追加版本
- ✅ **锚点注入管线**：parse5 遍历 body，对 30+ 种白名单标签（标题/段落/图片/按钮/表单控件/li/表格/区块容器等）注入 `data-cc-id`；已有锚点原样保留；svg/script/template 内部跳过
- ✅ **锚点写回**：push 把 instrument 后的 HTML 写回本地文件——agent 后续编辑天然保留锚点，这是评论跨版本存活的机制核心
- ✅ 版本管理：不可变版本序列 v1, v2, …；title 缺省从 `<title>` 提取；单文件 ≤5MB
- ✅ `.htmlcollab.json` 项目配置（server/slug/file），push 自动生成

### 3.3 评审（协作者侧，浏览器零安装）

- ✅ **评论模式**：hover 虚线高亮可评论元素；点击选中最深命中元素（li/img/button 级细粒度）；「⬆ 选父级」逐级扩大选区；Esc 取消
- ✅ **评论线程**：发表/回复/解决/重开；侧栏线程列表（待处理置顶）；评论气泡钉在元素右上角；侧栏↔元素双向定位（点线程滚动+闪烁，点气泡开线程）
- ✅ **锚点失效检测**：元素被删后评论标注「⚠ 元素已不存在」，进入上下文的独立分区
- ✅ **版本切换**：顶栏下拉切换历史版本（只读展示）；评论按当前版本计算锚定状态
- ✅ **内嵌登录**：未登录者点评论时侧栏内一步注册（email+昵称）
- ✅ **复制给 agent 修改**：选中元素或整条线程，生成含元素源码代码块、页面引用、操作步骤、激活咒语的提示词；首次点击弹引导（含一句话安装指引）
- ✅ 多人同步：3 秒轮询
- ✅ 移动端可用（响应式布局，窄屏评论栏移至底部）

### 3.4 反馈回流（agent 侧）

- ✅ `pull` / `GET /api/p/<slug>/context`：markdown 上下文——修改约定头（锚点保留铁律 + 闭环指令）+ 待处理/锚点失效/已解决三分区 + 元素引用与内容片段 + 完整线程；`?format=json` 机读版
- ✅ **解决回评**：`POST /api/comments/<id>/resolve` 支持附回复（"已在 v2 中…"），评审者网页端可见 agent 的答复
- ✅ `GET /api/p/<slug>/html`：最新版源码（含锚点、无 overlay）——协作者的 agent 获取他人页面源码的入口
- ✅ SKILL.md 工作流协议：触发场景对照表、首次激活流程、命令清单、四条铁律（锚点保留/写回预期/403 提权指引/resolve 用法）

### 3.5 用户、权限与管理（admin）

- ✅ **角色模型**：owner（创建者：全部权限+管理协作者+删页面）/ editor（评论+push+解决）/ commenter（评论+回复；持链接登录用户的默认角色）/ anon（只读）
- ✅ **分享/权限面板**（owner）：复制链接、按邮箱添加协作者、可评论↔可编辑切换、移除
- ✅ **Dashboard**：我发布的所有链接——标题、版本号、待处理/总评论数、打开/复制链接/删除（级联删版本与评论）、API Token 展示、agent 快速开始
- ✅ 权限执行点：push（owner/editor）、resolve（owner/editor/评论作者）、协作者管理（owner）、删除页面（owner）

### 3.6 CLI（`htmlcollab-cli`，零依赖）

| 命令 | 说明 |
|---|---|
| `install [--server]` | 写入 agent 生态物料；未激活时输出激活引导 |
| `auth <token> [--server]` | 网页激活回粘指令；验证并保存凭证 |
| `login [--email --name]` | 备用直登；无参时输出激活指引（不交互挂起） |
| `push [file] [--title] [--slug] [--notes]` | 发布/更新；写回 instrument 后的 HTML |
| `pull` | 输出反馈上下文 markdown |
| `open` | 浏览器打开协作页 |

### 3.7 基础设施

- ✅ Cloudflare Workers（OpenNext/Next.js 15）+ D1（SQLite 方言），零原生依赖
- ✅ monorepo：`apps/web`（全栈）/ `packages/cli` / `plugins/htmlcollab`（skill）/ `docs`
- ✅ 本地开发与生产同代码路径（miniflare 模拟 D1）；`pnpm db:local|db:remote` 迁移
- ✅ npm 官方源发布流程（2FA web-auth）

## 4. 已知限制与技术债（按风险排序）

1. **不可信 HTML 隔离未完成**：`/raw` 与主站同源，iframe sandbox 为宽松档（`allow-scripts allow-same-origin`）。开放陌生人使用前必须做独立子域 + CSP + sandbox 收紧。
2. **锚点迁移只有精确匹配**：agent 整段重写（丢锚点）时评论直接标失效，无 textDigest 模糊 remap 降级。
3. **轮询同步**：3 秒 fetch 轮询，无 SSE/WebSocket；评论量大时体感一般。
4. 单 HTML 文件：不支持多文件站点（css/js/图片需内联或外链）。
5. 无通知：新评论不推送（邮件/IM），依赖创作者主动 pull。
6. 免验证登录 = 邮箱可冒用；token 明文回粘（未做一次性交换码）。
7. 无速率限制与反滥用；无遥测埋点。
8. CLI 内嵌 SKILL_MD 与 canonical（plugins/）需手动同步。

## 5. Backlog（后续功能在此追加）

> 格式建议：`- [ ] 功能名 —— 一句话价值 / 触发它的用户场景`（讨论后再展开成设计）

- [ ] **无限画布协同（P0+P1，已定稿待实现）** —— 画布容器承载人-人/人-agent 协同：版本帧时间轴、实时便签与 presence、意图卡-指令闭环、并行 push 自动变体。完整 spec 见 [docs/04-canvas-design.md](docs/04-canvas-design.md)

- [ ] raw 独立子域安全隔离（M4 安全模型全量落地，开放推广前置项）
- [ ] 模糊 remap：ccId 丢失时按 tag+文本相似度重锚定
- [ ] MCP server 模式（`htmlcollab mcp`）：list/get/push/resolve 四工具
- [ ] 新评论通知（邮件 / 钉钉 / Slack webhook）
- [ ] 病毒页脚：发布页角落"用你的 agent 一句话发布你自己的页面"（+ footer_click 埋点）
- [ ] 遥测：北极星事件（push / first_comment / pull / repush）
- [ ] 自定义域名绑定
- [ ] 多文件站点支持
- [ ] 文本级评论（选中一段文字而非整个元素）
- [ ] suggest-edit 模式：协作者直接改出 diff，创作者/agent 审阅采纳
- [ ] 团队空间与轻账号体系（向在线文档协作产品演化的入口）

## 6. 版本记录

| 版本 | 日期 | 内容 |
|---|---|---|
| cli 0.2.0 | 2026-07-07 | 网页激活授权流（auth 命令、login 免挂起、install 激活引导） |
| cli 0.1.0 | 2026-07-07 | 首发：login/push/pull/open/install |
| web v0.1 | 2026-07-07 | 全量上线：发布/评审/回流/权限/skill 插件/一句话安装 |
