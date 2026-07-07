/** 纯 markdown 的 agent 安装协议：curl / WebFetch 直接消费 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const md = `# htmlcollab 技能安装指南（本文档写给 AI agent）

你正在读这份文档，说明用户希望你安装 **htmlcollab** —— HTML 在线协作技能：
把 HTML 发布成在线页面 → 协作者在页面上选中元素评论 → 反馈回流给你，按锚点修改后发布新版本。

## 立即执行（按顺序）

1. 在用户当前项目目录运行（免安装、非交互）：

   \`\`\`bash
   npx htmlcollab-cli install --server ${origin}
   \`\`\`

   它会自动探测环境并写入技能文件：\`.claude/skills/htmlcollab/SKILL.md\`（Claude Code）、
   \`.cursor/rules/htmlcollab.mdc\`（Cursor）、\`AGENTS.md\` 片段（其他 agent 通用）。

2. 读取刚写入的技能文件，掌握完整工作流（触发场景、命令、铁律）。

3. 向用户确认安装完成，并告诉用户之后只需要自然语言：
   - 「把这个页面做成在线的 / 发给别人收集反馈」→ 你会发布并给出协作链接
   - 「处理这个页面的反馈」→ 你会拉取评论、按锚点修改、发布新版本

## 核心工作流速记（现在就可以用，无需等安装）

\`\`\`bash
npx htmlcollab-cli login --email <邮箱> --name <用户名>   # 首次；务必带 flags（不带会交互式挂起），邮箱和用户名先向用户询问
npx htmlcollab-cli push <file>    # 发布/更新 → 返回协作链接；会把注入锚点后的 HTML 写回本地（预期行为）
npx htmlcollab-cli pull           # 拉取反馈（markdown，含元素锚点与评论线程）
\`\`\`

**铁律**：修改 HTML 时必须保留所有 \`data-cc-id\` 属性（评论锚点）；新增元素无需自己加。

## 补充

- Claude Code 用户可选全局安装：\`/plugin marketplace add Lichangfocus/htmlcollab\` → \`/plugin install htmlcollab@htmlcollab\`
- 没有 shell 的环境：直接用 HTTP API —— 反馈 \`GET ${origin}/api/p/<slug>/context\`，页面源码 \`GET ${origin}/api/p/<slug>/html\`
- 向他人页面发布需要编辑权限（403 时提示用户找页面创建者在「分享 / 权限」授权）
`
  return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
