import Link from 'next/link'
import { currentUser } from '@/lib/auth'

export default async function Landing() {
  const user = await currentUser()
  return (
    <div className="landing">
      <h1>
        agent 做的 HTML，<br />
        <span>一条命令</span>变成可协作的在线页面
      </h1>
      <p className="sub">
        发布后把链接发给任何人：像 Figma 一样选中元素评论。
        所有反馈自动变成结构化上下文，你的 agent 读取后直接迭代下一版。
      </p>
      <pre>
        <span className="c"># 在你的 agent 项目里</span>{'\n'}
        npx htmlcollab-cli login{'\n'}
        npx htmlcollab-cli push index.html   <span className="c"># → 得到协作链接</span>{'\n'}
        npx htmlcollab-cli pull              <span className="c"># → 反馈回流给 agent</span>
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
