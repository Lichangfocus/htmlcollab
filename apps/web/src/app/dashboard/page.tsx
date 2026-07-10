'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface PageRow {
  id: string
  slug: string
  title: string
  created_at: string
  latest_version: number
  open_comments: number
  total_comments: number
  my_role?: string
}

const ROLE_LABEL: Record<string, string> = { editor: '可编辑', commenter: '可评论' }

interface Me { id: string; email: string; name: string; apiToken: string }

export default function Dashboard() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [shared, setShared] = useState<PageRow[]>([])

  async function load() {
    const meRes = await fetch('/api/me').then((r) => r.json())
    if (!meRes.user) return router.push('/login')
    setMe(meRes.user)
    const res = await fetch('/api/pages')
    if (res.ok) {
      const d = await res.json()
      setPages(d.pages)
      setShared(d.shared ?? [])
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(p: PageRow) {
    if (!confirm(`删除「${p.title}」？所有版本和评论将一并删除，不可恢复。`)) return
    await fetch(`/api/p/${p.slug}`, { method: 'DELETE' })
    load()
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">◈ htmlcollab</Link>
        <span className="spacer" />
        {me && <span style={{ fontSize: 13, color: '#666' }}>{me.name} · {me.email}</span>}
        <button className="btn sm" onClick={logout}>退出</button>
      </header>
      <div className="dash">
        <h1>我的页面</h1>
        <p className="sub">你发布的所有在线协作链接</p>

        {pages === null ? (
          <p className="empty">加载中…</p>
        ) : pages.length === 0 ? (
          <p className="empty">还没有发布过页面，用下方命令发布第一个 ↓</p>
        ) : (
          pages.map((p) => (
            <div className="page-card" key={p.id}>
              <div className="info">
                <div className="name">{p.title}</div>
                <div className="meta">
                  v{p.latest_version} · <b>{p.open_comments}</b> 条待处理评论 / {p.total_comments} 总计 · {new Date(p.created_at).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <Link className="btn sm" href={`/p/${p.slug}`} target="_blank">打开</Link>
              <button className="btn sm" onClick={() => copy(`${location.origin}/p/${p.slug}`)}>复制链接</button>
              <button className="btn sm" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => remove(p)}>删除</button>
            </div>
          ))
        )}

        {shared.length > 0 && (
          <>
            <h1 style={{ marginTop: 36 }}>与我协作的页面</h1>
            <p className="sub">别人分享给你、或你参与过评论的页面</p>
            {shared.map((p) => (
              <div className="page-card" key={p.id}>
                <div className="info">
                  <div className="name">{p.title} <span className="role-chip">{ROLE_LABEL[p.my_role ?? ''] ?? '可评论'}</span></div>
                  <div className="meta">
                    v{p.latest_version} · <b>{p.open_comments}</b> 条待处理评论 / {p.total_comments} 总计 · {new Date(p.created_at).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <Link className="btn sm" href={`/p/${p.slug}`} target="_blank">打开</Link>
                <button className="btn sm" onClick={() => copy(`${location.origin}/p/${p.slug}`)}>复制链接</button>
              </div>
            ))}
          </>
        )}

        {me && (
          <div className="quickstart">
            <h3>用你的 agent 发布页面</h3>
            <pre>{`# 第一次：对你的 agent 说这句话，它会自动完成接入
帮我安装这个技能：${typeof location !== 'undefined' ? location.origin : ''}/install

# 之后：自然语言即可
“把这个页面做成在线的”     # → 协作链接
“处理这个页面的反馈”       # → 自动拉取评论、修改、发新版`}</pre>
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              API Token：<span className="token">{me.apiToken}</span>（agent 登录时用邮箱 {me.email} 即可，token 自动保存）
            </p>
          </div>
        )}
      </div>
    </>
  )
}
