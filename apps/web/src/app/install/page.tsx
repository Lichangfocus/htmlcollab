import { headers } from 'next/headers'
import Link from 'next/link'

export const metadata = { title: '接入你的 agent — htmlcollab' }

export default async function Install() {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? 'htmlcollab.dev'
  const origin = `${proto}://${host}`

  return (
    <div className="dash" style={{ maxWidth: 760 }}>
      <p style={{ margin: '18px 0' }}><Link href="/" className="brand">◈ htmlcollab</Link></p>
      <h1>让你的 agent 学会在线协作</h1>
      <p className="sub" style={{ lineHeight: 1.8 }}>
        htmlcollab 把 agent 生成的 HTML 变成可协作的在线页面：别人在页面上选中元素评论，
        你的 agent 拉取反馈、修改、发布新版本。装好之后，你只需要对 agent 说
        「<b>把这个页面做成在线的</b>」或「<b>处理这个页面的反馈</b>」。
      </p>

      <div className="quickstart" style={{ marginTop: 20 }}>
        <h3>方式一 · Claude Code 安装 skill 插件（推荐）</h3>
        <pre>{`/plugin marketplace add Lichangfocus/htmlcollab
/plugin install htmlcollab@htmlcollab`}</pre>
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
          在 Claude Code 里执行以上两条命令即可。装好后是<b>全局生效</b>的 skill：
          任何项目里说“把这个页面做成在线的”“处理这个页面的反馈”，agent 都会自动走 htmlcollab 协作循环。
        </p>
      </div>

      <div className="quickstart" style={{ marginTop: 16 }}>
        <h3>方式二 · 任意 agent，一条命令写入项目物料</h3>
        <pre>{`cd 你的项目目录
npx htmlcollab install --server ${origin}`}</pre>
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
          自动探测环境并写入：<code>.claude/skills/htmlcollab/SKILL.md</code>（Claude Code 项目级）、
          <code>.cursor/rules/htmlcollab.mdc</code>（Cursor）、<code>AGENTS.md</code> 片段（其他 agent 通用）。
        </p>
      </div>

      <div className="quickstart" style={{ marginTop: 16 }}>
        <h3>协作循环长这样</h3>
        <pre>{`npx htmlcollab login                # 首次：email + 用户名，免验证
npx htmlcollab push index.html      # 发布 → 得到协作链接，发给任何人
# …协作者在页面上选中元素评论（无需安装任何东西）…
npx htmlcollab pull                 # 反馈变成 markdown 上下文，agent 直接读
# agent 修改 HTML（保留 data-cc-id 锚点）后：
npx htmlcollab push                 # 发布 v2，评论自动跟随到新版本`}</pre>
      </div>

      <div className="quickstart" style={{ marginTop: 16 }}>
        <h3>方式三 · 不装任何东西，把这段话发给 agent</h3>
        <pre>{`这个项目使用 htmlcollab 做 HTML 在线协作（服务地址 ${origin}）。
- 发布/更新页面: npx htmlcollab push <file>
- 拉取评审反馈: npx htmlcollab pull（输出含元素锚点的 markdown）
- 修改 HTML 时必须保留所有 data-cc-id 属性（评论锚点）
- 向他人页面发布需要编辑权限: npx htmlcollab push <file> --slug <slug> --server ${origin}`}</pre>
      </div>

      <p style={{ margin: '24px 0', fontSize: 13 }}>
        <Link href="/login">登录</Link> · <Link href="/dashboard">我的页面</Link> ·{' '}
        <a href="https://github.com/Lichangfocus/htmlcollab" target="_blank">GitHub</a>
      </p>
    </div>
  )
}
