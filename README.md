# HTML Collab (htmlcollab)

agent 产出的 HTML 的协作评审层：本地 HTML 一键在线化 → 协作者选中元素评论 → 评论结构化回流给 agent（CLI / MCP），成为下一轮迭代的上下文。

**在线服务**: https://htmlcollab.lichangin.workers.dev

**接入方式（对任何 agent 说一句话）**:
> 帮我安装这个技能：https://htmlcollab.lichangin.workers.dev/install

## 核心循环

```
Claude Code 产出 HTML → htmlcollab push → 在线链接
    ↑                                        ↓
htmlcollab pull ← 结构化评论 ← 协作者选元素评论
```

## 结构

```
apps/web/        Next.js 15 全栈应用（node:sqlite，零原生依赖）
  src/lib/       db / auth / instrument(锚点注入) / context(agent 上下文生成)
  src/app/       登录、dashboard、评审 viewer、API 路由
  public/overlay.js   注入被评审页面的评论 SDK
packages/cli/    htmlcollab CLI（零依赖）：login / push / pull / open
docs/            产品设计、技术设计、路线图
demo/            最初的体验原型（已被正式版取代，留作参考）
```

## 本地运行

```bash
pnpm install
pnpm dev        # http://localhost:4600
```

## 使用

```bash
# 1. 发布（agent 项目目录里）
npx htmlcollab-cli login             # email + 用户名，免验证
npx htmlcollab-cli push index.html   # → 协作链接；instrument 后的 HTML 写回本地（锚点存活的关键）

# 2. 协作：把链接发给任何人，网页上选元素评论
#    （标题/段落/图片/按钮/li 级细粒度，可一键“选父级”扩大选区）

# 3. 回流
npx htmlcollab-cli pull              # → markdown 反馈上下文，agent 按其修改后再 push
```

开发期 CLI 未发 npm，用 `node packages/cli/bin.mjs <cmd>` 代替 `npx htmlcollab-cli <cmd>`。

## 文档

- [产品设计](docs/01-product-design.md) — 定位、核心循环、功能范围、关键决策
- [技术设计](docs/02-tech-design.md) — 架构、数据模型、锚点系统、安全模型、API、多 agent 集成策略
- [实施路线图](docs/03-roadmap.md) — M0~M4 分步计划与验收标准

## 状态

已完成 M0 骨架 + M1 元素评论 + M2 CLI 回流，外加登录（email 免验证）与 dashboard。
下一步 M3 生态适配层：MCP server、skill 物料与 `htmlcollab install`、触发文案打磨。
