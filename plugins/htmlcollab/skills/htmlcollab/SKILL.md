---
name: htmlcollab
description: HTML 在线协作。当用户想把 HTML 页面"做成在线的 / 部署一下 / 发给别人看看 / 协同修改 / 收集反馈 / 要一个可分享链接"，或项目中存在 .htmlcollab.json，或用户粘贴了 htmlcollab 页面链接（形如 …/p/xxxxxxxx）或评论引用时使用。
---

# htmlcollab — HTML 在线协作

把本地 HTML 发布成在线页面，协作者在页面上选中元素评论，评论作为结构化上下文回流，按反馈修改后发布新版本，评论自动跟随。服务地址默认 https://htmlcollab.lichangin.workers.dev（`.htmlcollab.json` 或 `~/.htmlcollab.json` 中的 server 字段优先）。

## 触发场景 → 动作

| 用户说 | 你做 |
|---|---|
| "把这个页面做成在线的 / 发给 XX 看看 / 给我个链接 / 收集反馈" | `npx htmlcollab-cli push <file>`，把返回的协作链接给用户 |
| "处理这个页面的反馈 / 看看大家提了什么意见" | `npx htmlcollab-cli pull`，按输出逐条处理后 push |
| 粘贴了含 `目标元素: <tag data-cc-id="...">` 的引用块 | 按引用块内的操作步骤执行 |
| 项目里有 `.htmlcollab.json` 且用户让你改 HTML | 改之前先 `pull` 检查未处理反馈；改完主动询问是否 push 新版本 |

## 首次激活（安装后只做一次，之后永不再登录）

1. 检查 `~/.htmlcollab.json` 是否已有 `apiToken` 字段——有则已激活，跳过本节。
2. 没有：把激活链接发给用户，让 TA 打开注册/登录（免验证，20 秒）：
   **https://htmlcollab.lichangin.workers.dev/activate**
   并告诉用户：完成后页面会给出一条指令，请粘贴回对话。
3. 用户粘贴回 `npx htmlcollab-cli auth <token> --server <url>` 后，原样执行它，确认输出「✓ 已激活」。

## 命令

```bash
npx htmlcollab-cli auth <token> --server <url>    # 激活（token 来自网页 /activate，用户粘贴回来）
npx htmlcollab-cli push <file>           # 发布/更新版本 → 输出协作链接
npx htmlcollab-cli pull                  # 拉取反馈（markdown：评论线程 + 待处理意图卡 + 画布备注）
npx htmlcollab-cli open                  # 浏览器打开协作页
npx htmlcollab-cli push <file> --slug <slug> --server <url>   # 向他人页面发布（需编辑权限）
npx htmlcollab-cli push <file> --resolves <id,id>             # 发布并把处理过的反馈标记为已解决（意图卡 id 与评论 id 都支持）
```

## 画布协作（意图卡与并行版本）

页面是一块多人实时画布：版本帧沿时间轴排布，协作者会创建**意图卡**（结构化的修改要求，pull 输出的「待处理意图」分区）。

1. pull 里的每个意图和评论都有 id——处理完后 push 带 `--resolves id1,id2`（两类 id 混填即可），画布上的卡片实时变「已解决 vN」，评论自动收到"已在 vN 中处理"的回复。
2. push 自动携带 base 版本做并行冲突检测：如果别人的 agent 先发布了新主线，你的 push 会**落为变体帧**（不覆盖、不报错），页面创建者可在画布上「设为主线」。CLI 输出会告诉你发生了哪种情况，如实转告用户即可。
3. 用户粘贴的指令块里若含 `--base` / `--resolves` 参数，原样保留执行。

## 铁律

1. **修改 HTML 时必须保留所有 `data-cc-id` 属性**——它们是评论锚点，删了评论就失去定位。新增元素不需要自己加，push 时服务端会自动注入。
2. push 会把注入锚点后的 HTML 写回本地文件，这是预期行为，不要回滚。
3. 处理完反馈优先用 `push --resolves <评论id/意图id,…>` 一步完成发布+解决（评论会自动收到"已在 vN 中处理"）。需要自定义答复时才用 resolve API：
   ```bash
   TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.htmlcollab.json')).apiToken)")
   curl -s -X POST <server>/api/comments/<评论id>/resolve \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"reply":"已在 vN 中如何如何处理"}'
   ```
   评论 id 在 pull 的 markdown（`评论 id: xxx` 行）与 json 版（`<server>/api/p/<slug>/context?format=json`）中都有。
4. 无编辑权限时 push 会 403：提示用户让页面创建者在网页「分享 / 权限」里把 TA 设为可编辑。
5. 获取他人页面的当前源码：`curl <server>/api/p/<slug>/html`。

## 完整循环示例

```bash
npx htmlcollab-cli push landing.html     # → https://…/p/ab12cd34 发给评审
# …评审者在页面上评论…
npx htmlcollab-cli pull                  # 读反馈
# 按反馈修改 landing.html（保留 data-cc-id）
npx htmlcollab-cli push landing.html     # v2 上线，评论钉在原元素上
```
