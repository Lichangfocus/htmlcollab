'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    router.push('/dashboard')
  }

  return (
    <div className="center-wrap">
      <form className="card" onSubmit={submit}>
        <h1>◈ htmlcollab</h1>
        <p className="sub">输入邮箱和用户名即可登录，首次登录自动注册（当前无需邮箱验证）。</p>
        <div className="field">
          <label>邮箱</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
        <div className="field">
          <label>用户名（评论时展示）</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="小王" required />
        </div>
        {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
        <button className="btn primary" style={{ width: '100%', padding: 12 }} disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
