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

## 最近更新（2026-07-10）

体验实测驱动的一轮 P0+P1 修复，闭环、版本管理、权限可见性全面补齐：

- **评论闭环补全**：`push --resolves` 现在同时接受**评论 id**（此前仅意图卡），解决时自动回评"已在 vN 中处理"；生成指令与 pull 上下文均携带评论 id；评论支持编辑与删除
- **首屏聚焦自愈**：修复打开链接偶现空白画布的相机计算 bug（容器尺寸未就绪时不再计算相机）；resize 自动重聚焦；内容跑出视野时浮出「回到最新版本」
- **版本时间轴导航**：顶栏版本徽章变为下拉时间轴（倒序 / 变体标注 / 最新徽章），点击直达任意版本帧
- **新版本实时提示**：任何人 push 后，开着页面的协作者立刻看到「🚀 xx 发布了 vN」浮条一键跳转；标签页标题显示待处理数
- **变体归档**：owner/editor 可把并行变体从画布收起（历史保留、随时恢复），画布不再越用越乱
- **角色与参与者可见**：顶栏角色徽章（创建者/可编辑/可评论）；分享面板列出"通过链接参与的人"并支持一键提权；Dashboard 新增「与我协作的页面」
- **diff 可读性**：版本改动明细展示完整元素文本，不再因子锚点截断缺字误导 agent
- 杂项：待处理计数口径统一（评论+标注）、Dashboard 版本号按主线显示、归档/转正跨端实时同步

详见 [PRODUCT.md](PRODUCT.md) 现状清单。

## 文档

- **[产品文档（现状清单 + Backlog）](PRODUCT.md)** — 已上线功能全景、已知限制、后续功能在此追加
- [产品设计](docs/01-product-design.md) — 定位、核心循环、功能范围、关键决策
- [技术设计](docs/02-tech-design.md) — 架构、数据模型、锚点系统、安全模型、API、多 agent 集成策略
- [实施路线图](docs/03-roadmap.md) — M0~M4 分步计划与验收标准

## 状态

核心闭环（push → 零安装评论 → pull 回流）+ 无限画布协同（版本帧时间轴 / 意图卡 / 并行 push 变体 / 实时 presence）+ 角色权限已全量可用，线上运行于 Cloudflare Workers。
下一步：画布协同上线部署（远程 D1 迁移 + CLI 0.3.0 发 npm）、raw 独立子域安全隔离、站外通知（邮件/IM）。完整 Backlog 见 [PRODUCT.md](PRODUCT.md)。
