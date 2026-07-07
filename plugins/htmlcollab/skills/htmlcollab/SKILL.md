---
name: htmlcollab
description: HTML 在线协作。当用户想把 HTML 页面"做成在线的 / 部署一下 / 发给别人看看 / 协同修改 / 收集反馈 / 要一个可分享链接"，或项目中存在 .htmlcollab.json，或用户粘贴了 htmlcollab 页面链接（形如 …/p/xxxxxxxx）或评论引用时使用。
---

# htmlcollab — HTML 在线协作

把本地 HTML 发布成在线页面，协作者在页面上选中元素评论，评论作为结构化上下文回流，按反馈修改后发布新版本，评论自动跟随。服务地址默认 https://htmlcollab.lichangin.workers.dev（`.htmlcollab.json` 或 `~/.htmlcollab.json` 中的 server 字段优先）。

## 触发场景 → 动作

| 用户说 | 你做 |
|---|---|
| "把这个页面做成在线的 / 发给 XX 看看 / 给我个链接 / 收集反馈" | `npx htmlcollab push <file>`，把返回的协作链接给用户 |
| "处理这个页面的反馈 / 看看大家提了什么意见" | `npx htmlcollab pull`，按输出逐条处理后 push |
| 粘贴了含 `目标元素: <tag data-cc-id="...">` 的引用块 | 按引用块内的操作步骤执行 |
| 项目里有 `.htmlcollab.json` 且用户让你改 HTML | 改之前先 `pull` 检查未处理反馈；改完主动询问是否 push 新版本 |

## 命令

```bash
npx htmlcollab login                 # 首次使用：email + 用户名，免验证
npx htmlcollab push <file>           # 发布/更新版本 → 输出协作链接
npx htmlcollab pull                  # 拉取反馈（markdown，含元素锚点与评论线程）
npx htmlcollab open                  # 浏览器打开协作页
npx htmlcollab push <file> --slug <slug> --server <url>   # 向他人页面发布（需编辑权限）
```

## 铁律

1. **修改 HTML 时必须保留所有 `data-cc-id` 属性**——它们是评论锚点，删了评论就失去定位。新增元素不需要自己加，push 时服务端会自动注入。
2. push 会把注入锚点后的 HTML 写回本地文件，这是预期行为，不要回滚。
3. 处理完某条反馈后，解决评论并附上说明（评审者会在网页端看到）：
   ```bash
   TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.htmlcollab.json')).apiToken)")
   curl -s -X POST <server>/api/comments/<评论id>/resolve \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"reply":"已在 vN 中如何如何处理"}'
   ```
   评论 id 在 `pull --format json`（`<server>/api/p/<slug>/context?format=json`）中可得；markdown 输出处理完直接 push 也可以，评审者自己会 resolve。
4. 无编辑权限时 push 会 403：提示用户让页面创建者在网页「分享 / 权限」里把 TA 设为可编辑。
5. 获取他人页面的当前源码：`curl <server>/api/p/<slug>/html`。

## 完整循环示例

```bash
npx htmlcollab push landing.html     # → https://…/p/ab12cd34 发给评审
# …评审者在页面上评论…
npx htmlcollab pull                  # 读反馈
# 按反馈修改 landing.html（保留 data-cc-id）
npx htmlcollab push landing.html     # v2 上线，评论钉在原元素上
```
