'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Me { id: string; email: string; name: string; apiToken: string }

export default function Activate() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => setMe(d.user))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) return setError(data.error || '登录失败')
    const meRes = await fetch('/api/me').then((r) => r.json())
    setMe(meRes.user)
  }

  const cmd = me ? `npx htmlcollab-cli auth ${me.apiToken} --server ${typeof location !== 'undefined' ? location.origin : ''}` : ''

  return (
    <div className="center-wrap">
      <div className="card" style={{ maxWidth: 520 }}>
        <h1>◈ 激活你的 agent</h1>
        {me === undefined ? null : me === null ? (
          <>
            <p className="sub">第 1 步 / 共 2 步：注册或登录（免邮箱验证，10 秒完成）。</p>
            <form onSubmit={submit}>
              <div className="field">
                <label>邮箱</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="field">
                <label>用户名（评论和发布时展示）</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="小王" required />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <button className="btn primary" style={{ width: '100%', padding: 12 }} disabled={busy}>
                {busy ? '登录中…' : '注册 / 登录'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="sub">
              第 2 步 / 共 2 步：已登录为 <b>{me.name}</b>（{me.email}）。
              把下面这条指令<b>原样粘贴回你的 agent 对话</b>，激活即完成——之后永远不用再登录。
            </p>
            <pre style={{ background: '#1a1a2e', color: '#a5f3a5', borderRadius: 10, padding: 16, fontSize: 12, overflowX: 'auto', userSelect: 'all' }}>{cmd}</pre>
            <button
              className="btn primary"
              style={{ width: '100%', padding: 12, marginTop: 12 }}
              onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            >
              {copied ? '✓ 已复制，去粘贴给你的 agent 吧' : '复制指令'}
            </button>
            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              这条指令包含你的专属凭证，agent 执行后会保存到本机 <code>~/.htmlcollab.json</code>。
              请勿分享给他人。<Link href="/dashboard">进入我的页面 →</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
