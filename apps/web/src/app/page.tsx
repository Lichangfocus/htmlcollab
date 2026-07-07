import Link from 'next/link'
import { headers } from 'next/headers'
import { currentUser } from '@/lib/auth'

export default async function Landing() {
  const user = await currentUser()
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? 'htmlcollab.lichangin.workers.dev'
  const origin = `${proto}://${host}`

  return (
    <div className="landing">
      <h1>
        agent 做的 HTML，<br />
        <span>一句话</span>变成可协作的在线页面
      </h1>
      <p className="sub">
        发布后把链接发给任何人：像 Figma 一样选中元素评论。
        所有反馈自动变成结构化上下文，你的 agent 读取后直接迭代下一版。
      </p>
      <pre>
        <span className="c"># 对你的 agent（Claude Code / Cursor / 任意）说一句话完成接入：</span>{'\n'}
        帮我安装这个技能：{origin}/install{'\n'}
        {'\n'}
        <span className="c"># 之后一切都是自然语言：</span>{'\n'}
        <span className="c">“把这个页面做成在线的”　→ 协作链接</span>{'\n'}
        <span className="c">“处理这个页面的反馈”　　→ 自动拉取评论、修改、发新版</span>
      </pre>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        {user ? (
          <Link href="/dashboard" className="btn primary">进入我的页面 →</Link>
        ) : (
          <Link href="/login" className="btn primary">登录 / 注册</Link>
        )}
        <Link href="/install" className="btn">接入你的 agent</Link>
      </div>
    </div>
  )
}
