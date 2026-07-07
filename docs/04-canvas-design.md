# 无限画布协同设计（P0+P1 实现 Spec）

> 状态：**已实现**（2026-07-07，本地验证通过，待部署）· 前置阅读：[产品文档](../PRODUCT.md) · [技术设计](02-tech-design.md)
>
> **实现偏差记录**：
> 1. 实时层 v1 用 **seq 增量轮询（1.5s）** 而非 Durable Objects——DO 在 OpenNext 本地 dev 组合是 spec 风险项 #2，且轮询本就是设计的降级路径；对象协议（seq/LWW）不变，DO 可无缝替换传输层。
> 2. 便签连线、区域批注未实现（P1 余量项，顺延）。
> 3. presence 经 D1 表 + 心跳（随轮询返回），非内存态。

## 0. 已拍板的四个决策

| 决策点 | 结论 |
|---|---|
| 画布定位 | 画布是 `/p/xxx` 页面本身的容器升级——本质仍是网页交互，画布是"人-人、人-agent 协同"的空间形态（参照 agent 生图产品的画布交互模式），不是独立的第二入口 |
| 人的编辑权 | **人不能直接编辑 HTML**。人的一切交互（选元素、圈区域、看评论、写意图）收敛为一个出口：**生成精准提示词，复制给自己的本地 agent 去改** |
| agent 驱动 | 只有本地 agent，各用各的（Claude Code / Cursor / 任意）。云上只存网页与协作内容 = **共同上下文（shared context）** |
| 本次范围 | P0（画布骨架+实时协同）+ P1（意图-指令闭环） |

## 1. 概念模型

```
                    ┌─────────────────────────────────────────┐
                    │   云端画布 = 共同上下文 (shared context)   │
                    │                                         │
   小王（浏览器）──▶ │  帧(版本/变体) · 评论 · 意图卡 · 便签      │ ◀── 老板（手机浏览器）
        │           │  presence · 认领状态 · 解决记录           │            │
        │ 复制指令    └─────────────────────────────────────────┘        只评论
        ▼                    ▲ push / pull ▲
   小王的本地 agent ──────────┘             └────────── 小李的本地 agent（editor 权限）
```

三条铁律：
1. **HTML 只有 agent 改**（经 push 产生不可变新版本），画布对象谁都能改（协同数据，粗粒度 LWW）。
2. **人的每个交互动作都通向"生成指令"**：意图的表达、讨论、认领、解决构成完整闭环，执行永远在各自本地。
3. **画布上的一切都是 agent 上下文**：pull 时评论、意图卡、便签、批注按结构化格式全部回流。

## 2. 画布对象模型

### 2.1 帧（Frame）—— 一等公民

一个帧 = HTML 渲染实例 `(versionId, viewport, kind)`。

- **kind**: `mainline`（主线版本，沿时间轴自动布局）| `variant`（变体/并行 push，纵向分叉排布）
- **viewport**: 预设 `desktop 1280` / `mobile 375`（P0 每版本默认一个 desktop 帧；同版本可手动添加 mobile 帧）
- **渲染降级**：视野内（含缓冲区）的帧 = live iframe（现有 /raw + overlay）；视野外 = 占位卡（标题 + vN + 待处理数）。IntersectionObserver 驱动，同屏 live iframe 上限 3 个（LRU 换出）
- 帧不可自由删除（版本即历史）；可折叠（收成卡片）

### 2.2 协同对象（全部实时同步）

| 对象 | 锚定 | 创建方式 | 进入 pull 上下文的形态 |
|---|---|---|---|
| 元素评论 | frame + cc-id | 现有交互（评论模式点选） | 现有 markdown 线程（不变） |
| **意图卡** | frame + cc-id（可空=页面级） | 见 §3 | 结构化意图块（§4.2） |
| 便签 | 自由坐标，可连线到帧/意图卡 | 双击空白处 | 连线归属对应元素；无连线归入「全局备注」 |
| 区域批注 | frame + 矩形 → 解析为覆盖的 cc-id 集合 | 在帧上拖框（P1 末位，可降级） |「涉及元素: [cc-id…]」+ 文字 |
| presence | - | 自动 | 不进上下文 |

所有对象含：`id, canvas_id, type, x, y, w, h, anchor(json), content(json), created_by, updated_at, seq`。

## 3. 核心交互设计（P1 的灵魂：意图-指令闭环）

### 3.1 意图卡的三个来源

1. **选元素起意图**：评论模式点选元素 → 面板双动作升级为三段式：
   `[写评论] [提意图 →] [直接复制指令]`
   「提意图」= 快捷意图类型 chips（改文案 / 调布局间距 / 换配色 / 重写这一块 / 删掉 / 其他）+ 自由文本 + 可选参考图粘贴。
2. **评论线程升级为意图**：任何线程上「转为意图」按钮——把讨论共识固化为待执行项。
3. **页面级意图**：不选元素直接创建（"整体配色往深色调走"）。

### 3.2 意图卡状态机（画布上实时可见）

```
open ──(某人点"复制指令"时可选认领)──▶ claimed(小王的 agent) ──(push --resolves)──▶ resolved(v5)
  │                                        │
  └──────────── 任何人可重开 ◀──────────────┘        超时 30min 自动回落 open
```

### 3.3 Prompt 生成器（"复制给 agent"的完全体）

任何意图卡 / 评论线程 / **多选一批对象** → 「生成指令」。模板：

```
请处理在线协作页面的以下 {N} 项反馈（htmlcollab）：

页面: {origin}/p/{slug}（当前 v{n}，base: {versionId}）

## 1. [意图·改文案] <h1 data-cc-id="cc-xxx">（"开完会 30 秒…"）
要求: 把 30 秒加粗，语气再锐利一点
相关讨论: 小王: 同意 / 老板: 顺便把副标题缩短
元素当前源码:
```html
…
```

## 2. …

操作步骤:
1. 已接入项目直接改本地文件；否则 curl {origin}/api/p/{slug}/html -o page.html
2. 保留所有 data-cc-id 属性
3. 发布并关联解决: npx htmlcollab-cli push page.html --slug {slug} --resolves {intentId1},{intentId2}
4. 完整上下文: npx htmlcollab-cli pull
```

要点：多项意图**一次打包**（人攒一批 → 一次复制 → agent 一次改完），`--resolves` 让解决状态自动回流画布。

### 3.4 并行 push = 自动变体（多人多 agent 并发的画布原生解法）

push 请求带 `base` 字段（CLI 从 .htmlcollab.json 记录的上次同步版本读取）：
- `base == latest` → 正常成为主线 v(n+1)
- `base != latest`（别人的 agent 先推了）→ **不报错不阻塞**，落为 latest 的 variant 帧，画布上并排出现，标注"基于 v{base} · 小李的 agent"
- 变体转正：owner/editor 点「设为主线」→ 变体成为 v(n+1)（P0+P1 只做整体转正，元素级合并留 P2+）

### 3.5 轻量评审者体验（画布的极简态）

链接打开 → 自动聚焦最新主线帧（占满视口，像现在的 viewer）→ 评论模式照旧。缩放/拖拽才会"发现"自己身处画布。手机端默认锁定单帧滚动，画布导航收进底部切换器。

## 4. 回流协议升级

### 4.1 push 增量

`POST /api/push` 新增：`base`（版本 id）、`resolves`（意图卡 id 数组）、`variantOf`（服务端派生）。响应含 `frameKind: mainline|variant`。

### 4.2 pull 上下文新增分区

```markdown
## 待处理意图 (3)
### 1. [改文案] `<h1 data-cc-id="cc-xxx">` ⟵ 认领: 无
…（含要求、讨论、参考图 URL）
## 画布备注
- 便签(连线到 cc-pricing): "价格区整体参考 stripe.com/pricing"
- 全局: "下周一要给客户演示"
```

## 5. 技术架构增量

### 5.1 实时层：Durable Objects

- `CanvasRoom` DO，每画布一实例：WebSocket 房间 + 对象内存态 + 变更序列号
- 消息协议：`{type: upsert|delete|presence|frame-added, object, seq, actor}`；对象级 LWW（seq 大者胜）
- 持久化：DO storage 为热态真值，debounce 3s 写 D1（`canvas_objects` 表）；pull/上下文生成只读 D1
- 降级：WebSocket 不可用时回落现有 3s 轮询（评论已有此路径）
- wrangler 配置：`durable_objects.bindings` + migrations（OpenNext worker 里 export DO class）

### 5.2 画布渲染

- 自研 DOM 画布：外层容器 `transform: translate(x,y) scale(z)`；帧、便签、pin 均为绝对定位 DOM；**不引入图形库**（live iframe 是核心，图形库反而是障碍）
- 缩放范围 0.1–2；<0.4 时帧自动降级占位卡（即使在视野内）
- iframe 交互与画布拖拽的手势仲裁：画布模式（默认，帧上覆盖透明层，拖=平移画布）vs 进入帧模式（双击帧进入，事件穿透给 iframe，Esc 退出）——这是画布容器最关键的手感细节
- overlay.js 增量：pin 渲染保持现状；新增区域框选消息（P1 末位）

### 5.3 数据模型增量（migration 0002）

```sql
canvases(id, page_id UNIQUE, created_at)                      -- 1 页面 = 1 画布，懒创建
canvas_objects(id, canvas_id, type, x,y,w,h, anchor TEXT, content TEXT,
               status, claimed_by, resolved_version_id,
               created_by, updated_at, seq INTEGER)
versions 增列: base_version_id TEXT, kind TEXT DEFAULT 'mainline', pushed_by TEXT
```
现有 comments 表不动（评论保持既有链路），意图卡为 canvas_objects(type='intent')，评论转意图时引用 comment id。

## 6. 权限映射

| 动作 | anon | commenter | editor | owner |
|---|---|---|---|---|
| 看画布/帧 | ✓ | ✓ | ✓ | ✓ |
| 评论/便签/意图卡/认领 | | ✓ | ✓ | ✓ |
| 复制指令 | ✓ | ✓ | ✓ | ✓ |
| push（含变体） | | | ✓ | ✓ |
| 变体转正 / 删除对象(他人的) | | | ✓ | ✓ |

## 7. 任务分解与验收（长任务用）

### P0 画布骨架 + 实时（先交付）
1. migration 0002 + CanvasRoom DO + WebSocket 客户端（含轮询降级）
2. 画布容器：pan/zoom、手势仲裁（画布模式/帧模式）、坐标系统
3. 帧系统：主线时间轴自动布局、live/占位卡降级、双击进帧
4. 现有评论 pin 上画布 + 评论侧栏改为浮动面板（跟随选中帧）
5. 便签 CRUD + 拖拽 + 连线（直线即可）
6. presence 光标（名字色块）
7. 轻量评审者聚焦态 + 移动端单帧锁定

**P0 验收**：两个浏览器同开一画布，A 拖便签 B 实时看到（<1s）；帧带 5 个版本时滚动流畅（live iframe ≤3）；手机打开体验不劣于现 viewer；评论全链路回归通过。

### P1 意图-指令闭环
1. 意图卡：三来源创建、状态机、认领/超时回落
2. Prompt 生成器：单项/多选打包、模板含源码与讨论、复制交互
3. push 升级：base 检测 → 变体帧、`--resolves` 状态回流（CLI + API + skill 文档同步）
4. pull 上下文新增意图/便签分区
5. 变体帧纵向布局 + 「设为主线」
6. （余量再做）区域批注

**P1 验收**：完整双人双 agent 剧本——小王提 2 个意图 + 老板 1 条评论转意图 → 小李多选 3 项复制指令给自己的 Claude Code → agent push --resolves → 画布上 3 张卡实时变 resolved(v2)、新帧出现在时间轴；同时小王的 agent 从旧 base push → 自动落为变体帧不冲突；pull 输出含全部画布上下文。

### 明确不做（本次）
服务端跑 agent、元素级跨变体合并、CRDT/文本协同、多文件站点、通知系统、直接编辑（任何形式）。

## 8. 风险清单

1. **手势仲裁手感**（画布拖拽 vs iframe 交互）是体验成败点，P0 第 2 步先出可玩 demo 验证再往下
2. OpenNext + DO 的组合需先跑通最小样例（export DO + wrangler migration），再接业务
3. iframe 多实例内存：严格执行 ≤3 live + LRU
4. DO 与 D1 双写一致性：以 DO 为准，D1 只做快照/查询，冲突可重建
