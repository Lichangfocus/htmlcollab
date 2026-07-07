import { headers } from 'next/headers'
import Link from 'next/link'
import CopyButton from './copy-button'

export const metadata = { title: '一句话接入你的 agent — htmlcollab' }

export default async function Install() {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? 'htmlcollab.lichangin.workers.dev'
  const origin = `${proto}://${host}`
  const magic = `帮我安装这个技能：${origin}/install`

  return (
    <div className="dash" style={{ maxWidth: 760 }}>
      <p style={{ margin: '18px 0' }}><Link href="/" className="brand">◈ htmlcollab</Link></p>
      <h1>一句话，装进任何 agent</h1>
      <p className="sub" style={{ lineHeight: 1.8 }}>
        把下面这句话原样发给你的 AI（Claude Code、Cursor、Codex CLI……任何能联网、能跑命令的 agent 都行），
        它会自己读懂本页面并完成安装：
      </p>

      <div className="quickstart" style={{ marginTop: 8, borderStyle: 'solid', borderColor: 'var(--brand)' }}>
        <pre style={{ fontSize: 15, background: '#f4f4ff' }}>{magic}</pre>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <CopyButton text={magic} />
        </div>
      </div>

      <p className="sub" style={{ lineHeight: 1.8, marginTop: 20 }}>
        装好之后，一切都是自然语言：说「<b>把这个页面做成在线的</b>」得到可协作链接；
        协作者在页面上选中元素评论；再说「<b>处理这个页面的反馈</b>」，agent 自动拉取评论、修改、发布新版本。
      </p>

      {/* 给正在抓取本页的 AI agent 的指令区 —— 人类可以忽略这一段 */}
      <div className="quickstart" style={{ marginTop: 24 }}>
        <h3>🤖 如果你是正在读取本页面的 AI agent</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 10 }}>
          用户希望你安装 htmlcollab（HTML 在线协作技能）。按顺序执行：
        </p>
        <pre>{`1. 在用户当前项目目录运行（非交互，免安装）：
   npx htmlcollab-cli install --server ${origin}
   （自动写入 .claude/skills/htmlcollab/SKILL.md 或 .cursor/rules 或 AGENTS.md）

2. 读取写入的技能文件，掌握完整工作流。

3. 告诉用户安装完成，之后只需说：
   「把这个页面做成在线的」→ 你发布并给出协作链接
   「处理这个页面的反馈」  → 你拉取评论、修改、发新版本

完整机读版协议: ${origin}/install.md
关键约定: 修改 HTML 必须保留所有 data-cc-id 属性（评论锚点）；
login 必须带 --email --name（先向用户询问），否则会交互式挂起。`}</pre>
      </div>

      <details style={{ marginTop: 20 }}>
        <summary style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>手动安装方式（不想让 agent 自动装时）</summary>
        <div className="quickstart" style={{ marginTop: 12 }}>
          <h3>Claude Code 全局插件</h3>
          <pre>{`/plugin marketplace add Lichangfocus/htmlcollab
/plugin install htmlcollab@htmlcollab`}</pre>
        </div>
        <div className="quickstart" style={{ marginTop: 12 }}>
          <h3>任意 agent，写入当前项目</h3>
          <pre>{`cd 你的项目目录
npx htmlcollab-cli install --server ${origin}`}</pre>
        </div>
        <div className="quickstart" style={{ marginTop: 12 }}>
          <h3>协作循环（装好后 agent 在背后跑的命令）</h3>
          <pre>{`npx htmlcollab-cli login --email 你的邮箱 --name 你的名字   # 首次，免验证
npx htmlcollab-cli push index.html      # 发布 → 协作链接
npx htmlcollab-cli pull                 # 反馈 → agent 可读的 markdown
npx htmlcollab-cli push                 # 修改后发 v2，评论自动跟随`}</pre>
        </div>
      </details>

      <p style={{ margin: '24px 0', fontSize: 13 }}>
        <Link href="/login">登录</Link> · <Link href="/dashboard">我的页面</Link> ·{' '}
        <a href="https://github.com/Lichangfocus/htmlcollab" target="_blank">GitHub</a> ·{' '}
        <a href={`${origin}/install.md`}>机读版</a>
      </p>
    </div>
  )
}
