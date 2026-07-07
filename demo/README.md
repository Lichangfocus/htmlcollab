# htmlcollab demo

零依赖的体验原型，覆盖核心循环的"感觉"：**发布页 → 选元素评论 → 线程/解决 → agent 上下文回流**。

## 运行

```bash
node demo/server.mjs
```

然后打开 http://localhost:4870

## 体验路径（约 3 分钟）

1. **评审体验**：点右上角「💬 评论模式」→ 鼠标扫过页面（虚线高亮可评论的元素块）→ 点击定价区标题 → 输入评论发送。
2. **多人协作感**：再开一个无痕窗口访问同一地址，用另一个昵称回复刚才的评论（3 秒轮询同步）。
3. **元素气泡**：注意有评论的元素右上角出现紫色数字气泡，点侧栏线程会滚动定位并闪烁对应元素。
4. **解决闭环**：点线程上的「✓ 解决」，气泡消失。
5. **agent 回流（核心差异化）**：点右上角「🤖 Agent 上下文」或运行：
   ```bash
   curl localhost:4870/context
   ```
   这就是真实产品里 `htmlcollab pull` 交给 agent 的 markdown —— 把它粘贴给 Claude Code 并附上 `demo/page.html`，agent 就能按反馈改页面（并保留 data-cc-id 锚点）。

## 与真实产品的差距（刻意省略的部分）

- 无 push/pull CLI 与版本管理（demo 只有 v1 一个写死的页面）
- data-cc-id 是手写的（真实产品由发布管线用 parse5 自动注入）
- iframe 未做 sandbox 与独立域隔离（安全模型见 docs/02-tech-design.md §6）
- JSON 文件存储、轮询同步（真实产品为 SQLite/Postgres + SWR/SSE）

## 重置数据

```bash
curl -X POST localhost:4870/api/reset
```
